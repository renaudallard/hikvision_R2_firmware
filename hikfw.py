#!/usr/bin/env python3
"""Hikvision firmware unpacker/repacker for SWKH format (IPC R2 series).

Supports unpack, repack, and resign of digicap.dav firmware files.
The header uses a rotating 16-byte XOR cipher.
File checksums are simple byte-sum.
The _cfgUpgSecPls signature file uses AES-256-ECB encryption with SHA-0 hashes.
"""

import argparse
import hashlib
import os
import struct
import sys

KEY_XOR = b'\xBA\xCD\xBC\xFE\xD6\xCA\xDD\xD3\xBA\xB9\xA3\xAB\xBF\xCB\xB5\xBE'

SWKH_MAGIC = b'SWKH'
SECPLS_MAGIC = 0x484B3533  # "35KH" in LE
SECPLS_PASSPHRASE = b'h@k8807H$Z5998' + b'\x00' * 17  # 31 bytes
SECPLS_SALT = b'HangZhou'


def xor_crypt(buf, start_offset=0):
    """XOR encrypt/decrypt buffer with rotating key. Same operation both ways."""
    result = bytearray(len(buf))
    for i in range(len(buf)):
        gi = start_offset + i
        result[i] = buf[i] ^ KEY_XOR[(gi + (gi >> 4)) & 0xF]
    return bytes(result)


def byte_checksum(data):
    """Simple byte-sum checksum used by Hikvision."""
    return sum(data) & 0xFFFFFFFF


def sha0(data):
    """Compute SHA-0 hash (original SHA without the rotation fix in expansion)."""
    h0, h1, h2, h3, h4 = 0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0
    msg = bytearray(data)
    orig_len = len(msg) * 8
    msg.append(0x80)
    while len(msg) % 64 != 56:
        msg.append(0)
    msg += struct.pack('>Q', orig_len)

    def lr(n, b):
        return ((n << b) | (n >> (32 - b))) & 0xFFFFFFFF

    for cs in range(0, len(msg), 64):
        w = [struct.unpack('>I', msg[cs + i * 4:cs + i * 4 + 4])[0] for i in range(16)]
        for i in range(16, 80):
            w.append((w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]) & 0xFFFFFFFF)
        a, b, c, d, e = h0, h1, h2, h3, h4
        for i in range(80):
            if i < 20:
                f, k = (b & c) | ((~b) & d), 0x5A827999
            elif i < 40:
                f, k = b ^ c ^ d, 0x6ED9EBA1
            elif i < 60:
                f, k = (b & c) | (b & d) | (c & d), 0x8F1BBCDC
            else:
                f, k = b ^ c ^ d, 0xCA62C1D6
            t = (lr(a, 5) + (f & 0xFFFFFFFF) + e + k + w[i]) & 0xFFFFFFFF
            e, d, c, b, a = d, c, lr(b, 30), a, t
        h0 = (h0 + a) & 0xFFFFFFFF
        h1 = (h1 + b) & 0xFFFFFFFF
        h2 = (h2 + c) & 0xFFFFFFFF
        h3 = (h3 + d) & 0xFFFFFFFF
        h4 = (h4 + e) & 0xFFFFFFFF
    return struct.pack('>5I', h0, h1, h2, h3, h4)


def evp_bytes_to_key(password, salt, key_len, iterations):
    """Replicate OpenSSL EVP_BytesToKey with MD5."""
    derived = b''
    d_prev = b''
    while len(derived) < key_len:
        d = d_prev + password + salt
        for _ in range(iterations):
            d = hashlib.md5(d).digest()
        derived += d
        d_prev = d
    return derived[:key_len]


def secpls_decrypt(raw_data):
    """Decrypt _cfgUpgSecPls. Returns (plaintext, aes_key)."""
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

    enc_len = struct.unpack('<I', raw_data[:4])[0]
    enc_data = raw_data[4:4 + enc_len]
    aes_key = evp_bytes_to_key(SECPLS_PASSPHRASE, SECPLS_SALT, 32, 2)
    cipher = Cipher(algorithms.AES(aes_key), modes.ECB())
    pt_raw = cipher.decryptor().update(enc_data) + cipher.decryptor().finalize()
    pad_len = pt_raw[-1]
    pt = pt_raw[:-pad_len]

    magic = struct.unpack('<I', pt[:4])[0]
    if magic != SECPLS_MAGIC:
        print(f"Error: bad secpls magic 0x{magic:08x} (expected 0x{SECPLS_MAGIC:08x})")
        sys.exit(1)

    return pt, aes_key


def secpls_encrypt(plaintext, aes_key):
    """Encrypt plaintext back into _cfgUpgSecPls format."""
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

    # PKCS7 padding to 16-byte boundary
    pad_len = 16 - (len(plaintext) % 16)
    padded = plaintext + bytes([pad_len] * pad_len)

    cipher = Cipher(algorithms.AES(aes_key), modes.ECB())
    enc_data = cipher.encryptor().update(padded) + cipher.encryptor().finalize()

    # Format: 4-byte LE length + encrypted data + trailing zeros to match original 500-byte size
    result = struct.pack('<I', len(enc_data)) + enc_data
    # Pad to 500 bytes (original file size)
    if len(result) < 500:
        result += b'\x00' * (500 - len(result))
    return result


def resign_secpls(secpls_data, file_entries):
    """Update _cfgUpgSecPls with new SHA-0 hashes for modified files.

    file_entries: list of (name, data, offset_in_firmware, size) for each signed file.
    """
    pt, aes_key = secpls_decrypt(secpls_data)
    pt = bytearray(pt)

    file_count = struct.unpack('<I', pt[28:32])[0]

    # Update total firmware size
    if file_entries:
        last = file_entries[-1]
        total_size = last[2] + last[3]  # offset + size
        struct.pack_into('<I', pt, 0x3c, total_size)

    # Update each file entry hash, size, and offset
    for i in range(file_count):
        off = 0xcc + i * 76
        name = pt[off:off + 32].split(b'\x00')[0].decode()

        for fe_name, fe_data, fe_offset, fe_size in file_entries:
            if fe_name == name:
                new_hash = sha0(fe_data)
                pt[off + 32:off + 52] = new_hash
                struct.pack_into('<I', pt, off + 52, fe_size)
                struct.pack_into('<I', pt, off + 56, fe_offset)
                break

    # Recompute header SHA-0 (hash of everything after the 24-byte header)
    new_header_hash = sha0(bytes(pt[24:]))
    pt[4:24] = new_header_hash

    return secpls_encrypt(bytes(pt), aes_key)


def parse_header(data):
    """Decrypt and parse the SWKH header. Returns header dict."""
    # First pass: decrypt first 16 bytes to get header length
    first16 = xor_crypt(data[:16])
    magic = first16[:4]
    if magic != SWKH_MAGIC:
        print(f"Error: bad magic after XOR decrypt: {magic.hex()} (expected {SWKH_MAGIC.hex()})")
        sys.exit(1)

    header_len = struct.unpack('<I', first16[8:12])[0]
    decrypted = xor_crypt(data[:header_len])

    hdr = {
        'magic': decrypted[0:4],
        'checksum': struct.unpack('<I', decrypted[4:8])[0],
        'header_len': header_len,
        'file_count': struct.unpack('<I', decrypted[12:16])[0],
        'language': struct.unpack('<I', decrypted[16:20])[0],
        'device_class': struct.unpack('<I', decrypted[20:24])[0],
        'oem_code': struct.unpack('<I', decrypted[24:28])[0],
        'fw_version': struct.unpack('<I', decrypted[28:32])[0],
        'total_size': struct.unpack('<I', decrypted[32:36])[0],
        'build_date': struct.unpack('<I', decrypted[36:40])[0],
        'raw_decrypted': decrypted,
        'files': [],
    }

    # Version/model string at 0x28
    ver_str = decrypted[0x28:0x40]
    hdr['version_string'] = ver_str

    # Parse file entries (44 bytes each starting at 0x40)
    for i in range(hdr['file_count']):
        off = 0x40 + i * 44
        entry = decrypted[off:off + 44]
        name = entry[:32].split(b'\x00')[0].decode(errors='replace')
        file_offset = struct.unpack('<I', entry[32:36])[0]
        file_size = struct.unpack('<I', entry[36:40])[0]
        file_chk = struct.unpack('<I', entry[40:44])[0]
        hdr['files'].append({
            'name': name,
            'offset': file_offset,
            'size': file_size,
            'checksum': file_chk,
        })

    # Verify header checksum
    calc_chk = byte_checksum(decrypted[12:header_len])
    if calc_chk != hdr['checksum']:
        print(f"Warning: header checksum mismatch. stored=0x{hdr['checksum']:08X} calc=0x{calc_chk:08X}")
    else:
        print(f"Header checksum OK (0x{calc_chk:08X})")

    return hdr


def unpack(firmware_path, output_dir):
    """Unpack firmware into individual files."""
    with open(firmware_path, 'rb') as f:
        data = f.read()

    print(f"Firmware size: {len(data)} bytes")
    hdr = parse_header(data)

    os.makedirs(output_dir, exist_ok=True)

    # Save decrypted header metadata
    print(f"\nFirmware info:")
    print(f"  Language:     {hdr['language']} (1=EN/ML)")
    print(f"  Device class: {hdr['device_class']}")
    print(f"  OEM code:     {hdr['oem_code']}")
    print(f"  Build date:   {hdr['build_date']}")
    print(f"  Files:        {hdr['file_count']}")
    print()

    # Save the raw decrypted header for reference
    with open(os.path.join(output_dir, '_header.bin'), 'wb') as f:
        f.write(hdr['raw_decrypted'])

    # Extract each file
    for i, finfo in enumerate(hdr['files']):
        name = finfo['name']
        offset = finfo['offset']
        size = finfo['size']
        expected_chk = finfo['checksum']

        file_data = data[offset:offset + size]
        calc_chk = byte_checksum(file_data)
        status = "OK" if calc_chk == expected_chk else "CHECKSUM MISMATCH"

        safe_name = name.replace('/', '_').replace('\\', '_')
        out_path = os.path.join(output_dir, safe_name)
        with open(out_path, 'wb') as f:
            f.write(file_data)

        print(f"  [{i}] {name:20s}  offset=0x{offset:08X}  size={size:>10d}  chk={status}")

    # Save metadata for repacking
    meta_path = os.path.join(output_dir, '_metadata.txt')
    with open(meta_path, 'w') as f:
        f.write(f"header_len={hdr['header_len']}\n")
        f.write(f"file_count={hdr['file_count']}\n")
        f.write(f"language={hdr['language']}\n")
        f.write(f"device_class={hdr['device_class']}\n")
        f.write(f"oem_code={hdr['oem_code']}\n")
        f.write(f"fw_version=0x{hdr['fw_version']:08X}\n")
        f.write(f"build_date={hdr['build_date']}\n")
        f.write(f"version_string={hdr['version_string'].hex()}\n")
        for finfo in hdr['files']:
            f.write(f"file={finfo['name']}\n")

    print(f"\nUnpacked {len(hdr['files'])} files to {output_dir}/")
    print(f"Metadata saved to {meta_path}")
    print(f"Decrypted header saved to {output_dir}/_header.bin")


def repack(input_dir, output_path):
    """Repack modified files into a firmware image."""
    meta_path = os.path.join(input_dir, '_metadata.txt')
    if not os.path.exists(meta_path):
        print(f"Error: {meta_path} not found. Run unpack first.")
        sys.exit(1)

    # Read metadata
    meta = {}
    file_names = []
    with open(meta_path) as f:
        for line in f:
            line = line.strip()
            if line.startswith('file='):
                file_names.append(line[5:])
            elif '=' in line:
                key, val = line.split('=', 1)
                meta[key] = val

    header_len = int(meta['header_len'])
    file_count = int(meta['file_count'])
    language = int(meta['language'])
    device_class = int(meta['device_class'])
    oem_code = int(meta['oem_code'])
    fw_version = int(meta['fw_version'], 16)
    build_date = int(meta['build_date'])
    version_string = bytes.fromhex(meta['version_string'])

    if len(file_names) != file_count:
        print(f"Error: metadata says {file_count} files but found {len(file_names)} file entries")
        sys.exit(1)

    # Read all file contents
    file_contents = []
    for name in file_names:
        safe_name = name.replace('/', '_').replace('\\', '_')
        path = os.path.join(input_dir, safe_name)
        if not os.path.exists(path):
            print(f"Error: {path} not found")
            sys.exit(1)
        with open(path, 'rb') as f:
            file_contents.append(f.read())

    # Calculate offsets. Files are packed sequentially after the header.
    current_offset = header_len
    file_entries = []
    for i, (name, content) in enumerate(zip(file_names, file_contents)):
        chk = byte_checksum(content)
        file_entries.append({
            'name': name,
            'offset': current_offset,
            'size': len(content),
            'checksum': chk,
        })
        current_offset += len(content)

    total_size = current_offset

    # Resign _cfgUpgSecPls with updated SHA-0 hashes
    secpls_idx = None
    for i, name in enumerate(file_names):
        if name == '_cfgUpgSecPls':
            secpls_idx = i
            break

    if secpls_idx is not None:
        print("Resigning _cfgUpgSecPls with updated SHA-0 hashes...")
        # Collect signed file info (excluding _cfgUpgSecPls itself)
        signed_files = []
        for entry in file_entries:
            if entry['name'] != '_cfgUpgSecPls':
                idx = file_names.index(entry['name'])
                signed_files.append((
                    entry['name'],
                    file_contents[idx],
                    entry['offset'],
                    entry['size'],
                ))

        new_secpls = resign_secpls(file_contents[secpls_idx], signed_files)
        file_contents[secpls_idx] = new_secpls

        # Recalculate offsets since secpls size might have changed
        current_offset = header_len
        for i, (name, content) in enumerate(zip(file_names, file_contents)):
            file_entries[i]['offset'] = current_offset
            file_entries[i]['size'] = len(content)
            file_entries[i]['checksum'] = byte_checksum(content)
            current_offset += len(content)
        total_size = current_offset

        # Re-resign with corrected offsets (secpls size change shifts all files)
        signed_files = []
        for entry in file_entries:
            if entry['name'] != '_cfgUpgSecPls':
                idx = file_names.index(entry['name'])
                signed_files.append((
                    entry['name'],
                    file_contents[idx],
                    entry['offset'],
                    entry['size'],
                ))
        new_secpls = resign_secpls(file_contents[secpls_idx], signed_files)
        if len(new_secpls) != len(file_contents[secpls_idx]):
            print("Error: secpls size changed during re-resign (should be stable)")
            sys.exit(1)
        file_contents[secpls_idx] = new_secpls
        file_entries[secpls_idx]['checksum'] = byte_checksum(new_secpls)

    # Build decrypted header
    hdr_buf = bytearray(header_len)

    # Magic
    hdr_buf[0:4] = SWKH_MAGIC
    # Checksum placeholder at [4:8]
    struct.pack_into('<I', hdr_buf, 8, header_len)
    struct.pack_into('<I', hdr_buf, 12, file_count)
    struct.pack_into('<I', hdr_buf, 16, language)
    struct.pack_into('<I', hdr_buf, 20, device_class)
    struct.pack_into('<I', hdr_buf, 24, oem_code)
    struct.pack_into('<I', hdr_buf, 28, fw_version)
    struct.pack_into('<I', hdr_buf, 32, total_size)
    struct.pack_into('<I', hdr_buf, 36, build_date)

    # Version string at 0x28
    vs_len = min(len(version_string), 0x40 - 0x28)
    hdr_buf[0x28:0x28 + vs_len] = version_string[:vs_len]

    # File entries at 0x40, 44 bytes each
    for i, entry in enumerate(file_entries):
        off = 0x40 + i * 44
        name_bytes = entry['name'].encode('ascii')[:32]
        hdr_buf[off:off + len(name_bytes)] = name_bytes
        struct.pack_into('<I', hdr_buf, off + 32, entry['offset'])
        struct.pack_into('<I', hdr_buf, off + 36, entry['size'])
        struct.pack_into('<I', hdr_buf, off + 40, entry['checksum'])

    # Calculate header checksum (sum of bytes from offset 12 to end of header)
    hdr_checksum = byte_checksum(hdr_buf[12:]) & 0xFFFFFFFF
    struct.pack_into('<I', hdr_buf, 4, hdr_checksum)

    # XOR encrypt header
    encrypted_hdr = xor_crypt(bytes(hdr_buf))

    # Assemble firmware
    with open(output_path, 'wb') as f:
        f.write(encrypted_hdr)
        for content in file_contents:
            f.write(content)

    print(f"Repacked firmware written to {output_path}")
    print(f"  Header checksum: 0x{hdr_checksum:08X}")
    print(f"  Total size: {total_size} bytes")
    print(f"  Files: {file_count}")
    for entry in file_entries:
        print(f"    {entry['name']:20s}  offset=0x{entry['offset']:08X}  size={entry['size']:>10d}  chk=0x{entry['checksum']:08X}")

    # Verify by re-reading
    print("\nVerifying repacked firmware...")
    with open(output_path, 'rb') as f:
        verify_data = f.read()
    verify_hdr = parse_header(verify_data)
    for finfo in verify_hdr['files']:
        file_data = verify_data[finfo['offset']:finfo['offset'] + finfo['size']]
        calc = byte_checksum(file_data)
        status = "OK" if calc == finfo['checksum'] else "FAIL"
        print(f"  {finfo['name']:20s}  checksum {status}")
    print("Verification complete.")


def info(firmware_path):
    """Display firmware information without extracting."""
    with open(firmware_path, 'rb') as f:
        data = f.read()

    print(f"Firmware: {firmware_path}")
    print(f"Size: {len(data)} bytes")
    hdr = parse_header(data)

    print(f"\nHeader length: {hdr['header_len']} bytes")
    print(f"Language:      {hdr['language']} (1=EN/ML, 2=CN)")
    print(f"Device class:  {hdr['device_class']}")
    print(f"OEM code:      {hdr['oem_code']}")
    print(f"FW version:    0x{hdr['fw_version']:08X}")
    print(f"Build date:    {hdr['build_date']}")
    print(f"Total size:    {hdr['total_size']}")

    print(f"\nFiles ({hdr['file_count']}):")
    for i, finfo in enumerate(hdr['files']):
        file_data = data[finfo['offset']:finfo['offset'] + finfo['size']]
        calc_chk = byte_checksum(file_data)
        status = "OK" if calc_chk == finfo['checksum'] else "MISMATCH"
        print(f"  [{i}] {finfo['name']:20s}  offset=0x{finfo['offset']:08X}  size={finfo['size']:>10d}  chk={status}")


def verify_secpls(firmware_path):
    """Verify _cfgUpgSecPls hashes in a firmware image."""
    with open(firmware_path, 'rb') as f:
        data = f.read()

    hdr = parse_header(data)

    secpls_data = None
    for finfo in hdr['files']:
        if finfo['name'] == '_cfgUpgSecPls':
            secpls_data = data[finfo['offset']:finfo['offset'] + finfo['size']]
            break

    if secpls_data is None:
        print("No _cfgUpgSecPls found in firmware.")
        return

    pt, _ = secpls_decrypt(secpls_data)
    file_count = struct.unpack('<I', pt[28:32])[0]

    print(f"\nSecpls signature verification ({file_count} signed files):")
    all_ok = True
    for i in range(file_count):
        off = 0xcc + i * 76
        name = pt[off:off + 32].split(b'\x00')[0].decode()
        stored_hash = pt[off + 32:off + 52]
        size = struct.unpack('<I', pt[off + 52:off + 56])[0]
        fw_offset = struct.unpack('<I', pt[off + 56:off + 60])[0]

        file_data = data[fw_offset:fw_offset + size]
        computed_hash = sha0(file_data)
        match = computed_hash == stored_hash
        status = "OK" if match else "MISMATCH"
        if not match:
            all_ok = False

        print(f"  {name:20s}  SHA-0={stored_hash.hex()[:16]}...  {status}")

    # Verify header hash
    header_hash = pt[4:24]
    computed_hdr = sha0(pt[24:])
    hdr_ok = computed_hdr == header_hash
    print(f"  {'(header)':20s}  SHA-0={header_hash.hex()[:16]}...  {'OK' if hdr_ok else 'MISMATCH'}")

    if all_ok and hdr_ok:
        print("All signature hashes verified.")
    else:
        print("WARNING: Signature verification FAILED.")


def main():
    parser = argparse.ArgumentParser(description='Hikvision SWKH firmware unpacker/repacker')
    sub = parser.add_subparsers(dest='command', help='Command')

    p_unpack = sub.add_parser('unpack', help='Unpack firmware')
    p_unpack.add_argument('firmware', help='Path to digicap.dav')
    p_unpack.add_argument('-o', '--output', default=None, help='Output directory (default: <firmware>_unpacked)')

    p_repack = sub.add_parser('repack', help='Repack firmware from unpacked directory')
    p_repack.add_argument('input_dir', help='Unpacked firmware directory')
    p_repack.add_argument('-o', '--output', default=None, help='Output firmware path (default: repacked.dav)')

    p_info = sub.add_parser('info', help='Show firmware info')
    p_info.add_argument('firmware', help='Path to digicap.dav')

    p_verify = sub.add_parser('verify', help='Verify _cfgUpgSecPls signature hashes')
    p_verify.add_argument('firmware', help='Path to digicap.dav')

    args = parser.parse_args()

    if args.command == 'unpack':
        output = args.output or (args.firmware + '_unpacked')
        unpack(args.firmware, output)
    elif args.command == 'repack':
        output = args.output or 'repacked.dav'
        repack(args.input_dir, output)
    elif args.command == 'info':
        info(args.firmware)
    elif args.command == 'verify':
        verify_secpls(args.firmware)
    else:
        parser.print_help()


if __name__ == '__main__':
    main()
