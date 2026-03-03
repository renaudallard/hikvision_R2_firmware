# hikfw

Unpack, modify, resign, and repack Hikvision IPC R2 series firmware (`digicap.dav`).

Tested on **DS-2CD2420F-IW** (V5.4.800 build 210813). Should work on other IPC R2 models using the SWKH firmware format.

## What it does

```
digicap.dav ──unpack──> unpacked/
                          ├── _cfgUpgSecPls    (signature file)
                          ├── _cfgUpgClass     (device compatibility)
                          ├── uImage           (Linux kernel)
                          ├── app.img          (CramFS application filesystem)
                          ├── _header.bin      (decrypted SWKH header)
                          └── _metadata.txt    (repacking metadata)

                        edit files (e.g. rebuild app.img with mkfs.cramfs)

unpacked/ ───repack───> modified.dav   (auto-resigns _cfgUpgSecPls)
```

Repacking automatically updates the `_cfgUpgSecPls` signature file with correct SHA-0 hashes, so the camera accepts the modified firmware.

## Requirements

- Python 3.6+
- `cryptography` library (`pip install cryptography`)

## Usage

### Inspect firmware

```sh
python3 hikfw.py info digicap.dav
```

### Unpack

```sh
python3 hikfw.py unpack digicap.dav -o unpacked
```

### Modify the CramFS

```sh
# Extract
mkdir cramfs_root
/usr/sbin/fsck.cramfs --extract=cramfs_root unpacked/app.img

# Make changes...
vi cramfs_root/initrun.sh

# Rebuild (must match original size exactly)
/usr/sbin/mkfs.cramfs -n r2_app cramfs_root unpacked/app.img
```

### Repack (with automatic resign)

```sh
python3 hikfw.py repack unpacked -o modified.dav
```

### Verify signatures

```sh
python3 hikfw.py verify modified.dav
```

### Flash to camera

```sh
curl -u 'admin:PASSWORD' -X PUT \
  "http://CAMERA_IP/ISAPI/System/updateFirmware" \
  --data-binary @modified.dav \
  -H "Content-Type: application/octet-stream"
```

## Firmware format

### SWKH header

The outer container uses a 240-byte XOR-encrypted header:

| Offset | Size | Field |
|--------|------|-------|
| 0x00 | 4 | Magic (`SWKH`) |
| 0x04 | 4 | Header checksum (byte-sum of bytes 12..end) |
| 0x08 | 4 | Header length |
| 0x0C | 4 | File count |
| 0x10 | 4 | Language |
| 0x14 | 4 | Device class |
| 0x18 | 4 | OEM code |
| 0x1C | 4 | Firmware version |
| 0x20 | 4 | Total size |
| 0x24 | 4 | Build date |
| 0x28 | 24 | Version string |
| 0x40 | 44 each | File entries (name[32] + offset[4] + size[4] + checksum[4]) |

XOR encryption uses a rotating 16-byte key with index `(i + (i >> 4)) & 0xF`.

### _cfgUpgSecPls signature file

The signature file that prevents flashing modified firmware:

| Layer | Algorithm | Details |
|-------|-----------|---------|
| Outer | Raw | First 4 bytes = uint32 LE encrypted data length |
| Encryption | AES-256-ECB | Key from `EVP_BytesToKey(MD5, iter=2)` |
| Passphrase | | `h@k8807H$Z5998` (padded to 31 bytes with nulls) |
| Salt | | `HangZhou` |
| File hashes | SHA-0 | The original SHA (no rotation in expansion), not SHA-1 |
| RSA check | Stub | The RSA verify function in the binary always returns 0 |

Decrypted structure (432 bytes):

| Offset | Size | Field |
|--------|------|-------|
| 0x00 | 4 | Magic (`35KH` / `0x484B3533` LE) |
| 0x04 | 20 | SHA-0 hash of bytes 24..end |
| 0x18 | 4 | Total plaintext length |
| 0x1C | 4 | Signed file count |
| 0x58 | 64 | Signer name |
| 0x98 | 52 | Version string |
| 0xCC | 76 each | File entries (name[32] + sha0[20] + size[4] + offset[4] + pad[16]) |

### Firmware layout

```
Offset     Size       Section
─────────────────────────────────────────────
0x000      240 B      SWKH header (XOR encrypted)
0x0F0      500 B      _cfgUpgSecPls (AES-256-ECB encrypted SHA-0 hashes)
0x2E4      780 B      _cfgUpgClass (device compatibility table)
0x5F0      ~3.5 MB    uImage (Linux kernel, ARM zImage)
0x3586CC   ~10.2 MB   app.img (CramFS application filesystem)
```

## CramFS notes

- Flat structure (all files in root, no subdirectories)
- Rebuilt image must match original size exactly (10,747,904 bytes for this model)
- Use `mkfs.cramfs -n r2_app` to preserve the volume name
- `initrun.sh` is the main init script that sets up the system at boot

## License

Public domain. Use at your own risk. Modifying camera firmware may void your warranty and could brick your device.
