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

## Install

```sh
git clone https://github.com/renaudallard/hikvision_R2_firmware.git
cd hikvision_R2_firmware
pip install cryptography
```

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
truncate -s 10747904 unpacked/app.img
```

CramFS has a flat structure (all files in root, no subdirectories). The rebuilt image must match the original size exactly (10,747,904 bytes). CramFS reads size from its superblock and ignores trailing zeros, so zero-padding is safe.

`IEfile.tar.gz` contains the web UI. Despite the `.gz` extension, it is LZMA-compressed. Extracted on camera by `tar zxf ... --lzma`. When rebuilding: `tar cf - doc codebase dispatch.asp favicon.ico index.asp | lzma -9 > IEfile.tar.gz`. Do NOT use `tar cf - .` as the `./` prefix in paths breaks the web server.

### Freeing space in the CramFS

The CramFS image is fixed-size (10,747,904 bytes). To add new files (e.g. a custom dropbear binary), you need to free space first. Candidates:

| File | Size | Description |
|------|------|-------------|
| `WebComponents.exe` | 2.4 MB | ActiveX installer for IE. Useless on modern browsers. Safe to delete. |
| `IEfile.tar.gz` translations | ~300 KB | 26 non-English language packs in `doc/i18n/`. English is NOT in this directory (it comes from `IElang.tar`). Delete the language directories and update `doc/i18n/Languages.json` to `{"Languages":[{"isDefault":true,"name":"English","value":"en"}]}` |
| `codebase/version.xml` | small | ActiveX version checker. Safe to delete. |

To strip translations from IEfile.tar.gz:

```sh
# Extract
mkdir IEfile_work
cd IEfile_work
tar xf /path/to/cramfs_root/IEfile.tar.gz --lzma

# Remove all non-English translations
rm -rf doc/i18n/bg doc/i18n/cs doc/i18n/da doc/i18n/de doc/i18n/el \
       doc/i18n/et doc/i18n/fi doc/i18n/fr doc/i18n/hr doc/i18n/hu \
       doc/i18n/it doc/i18n/ja doc/i18n/ko doc/i18n/nl doc/i18n/no \
       doc/i18n/pl doc/i18n/pt doc/i18n/ro doc/i18n/sk doc/i18n/sl \
       doc/i18n/sr doc/i18n/sv doc/i18n/th doc/i18n/tr doc/i18n/vi \
       doc/i18n/zh_TW

# Set English-only in language dropdown
echo '{"Languages":[{"isDefault":true,"name":"English","value":"en"}]}' > doc/i18n/Languages.json

# Remove ActiveX version checker
rm -f codebase/version.xml

# Repack (LZMA, not gzip)
tar cf - doc codebase dispatch.asp favicon.ico index.asp | lzma -9 > ../cramfs_root/IEfile.tar.gz
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

**Warning:** The firmware update flashes both uImage (kernel) and app.img. A bad image in either section bricks the camera and requires UART recovery. The web server and SSH both depend on CramFS applications starting successfully, so a corrupted CramFS is just as unrecoverable as a bad kernel without UART access.

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

XOR key: `BA CD BC FE D6 CA DD D3 BA B9 A3 AB BF CB B5 BE`
XOR index formula: `(i + (i >> 4)) & 0xF`
Checksum: simple byte-sum, `sum(data) & 0xFFFFFFFF`

### _cfgUpgSecPls signature file

The signature file that prevents flashing modified firmware:

| Layer | Algorithm | Details |
|-------|-----------|---------|
| Outer | Raw | First 4 bytes = uint32 LE encrypted data length |
| Encryption | AES-256-ECB | Key from `EVP_BytesToKey(MD5, iter=2)` |
| Passphrase | | `h@k8807H$Z5998` (padded to 31 bytes with nulls) |
| Salt | | `HangZhou` |
| AES key | | `d4fc07df17fbe90245c488737b1c70fa4cdd3bc91c90874803df73eb0fed6450` |
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
-----------------------------------------------
0x000      240 B      SWKH header (XOR encrypted)
0x0F0      500 B      _cfgUpgSecPls (AES-256-ECB encrypted SHA-0 hashes)
0x2E4      780 B      _cfgUpgClass (device compatibility table)
0x5F0      ~3.5 MB    uImage (Linux kernel, ARM zImage)
0x3586CC   ~10.2 MB   app.img (CramFS application filesystem)
```

## Recovery

The DS-2CD2420F-IW PCB has **no UART pin headers or exposed test pads**. To open the case, note there is a hidden screw behind the Hikvision sticker on the back. However, the Hi3518E u-boot bootloader has built-in TFTP recovery. This works even when the kernel or CramFS is corrupted.

### TFTP recovery

Hold the reset button while powering on the camera (keep holding for at least 10 seconds). This triggers u-boot to look for a TFTP server on the network and download `digicap.dav`.

| Camera IP | TFTP server IP |
|-----------|----------------|
| 192.0.0.64 | 192.0.0.128 |
| 192.168.1.64 | 192.168.1.128 |

The address pair is hardcoded in u-boot and varies by model. Try both. If neither works, use `tcpdump -i eth0 arp` to see which IP the camera requests.

The camera uses a proprietary handshake on UDP ports 9978/9979 before requesting `digicap.dav` via standard TFTP (port 69). The included `hikvision_tftpd.py` script (based on [scottlamb/hikvision-tftpd](https://github.com/scottlamb/hikvision-tftpd)) handles both the handshake and TFTP serving.

```sh
git clone https://github.com/renaudallard/hikvision_R2_firmware.git
cd hikvision_R2_firmware

# Download the recovery firmware from the GitHub release
gh release download v5.4.800-recovery

# Add the expected server IP to your interface
sudo ip addr add 192.0.0.128/24 dev eth0

# Connect camera directly via ethernet, then:
sudo ./hikvision_tftpd.py digicap.dav

# Hold reset button, power on the camera, keep holding 10+ seconds
# Wait 3-5 minutes for the transfer and reflash to complete
```

If the camera doesn't connect, use `tcpdump -i eth0 arp` to see what IP it's requesting and adjust accordingly.

### SPI flash programmer (last resort)

If TFTP recovery fails, the SPI NOR flash chip (SOIC-8, e.g. W25Q128) can be reprogrammed directly with a CH341A USB programmer and a SOIC-8 clip:

```sh
sudo apt install flashrom
flashrom -p ch341a_spi -r bricked_dump.bin    # backup first
flashrom -p ch341a_spi -w good_dump.bin       # restore
```

This requires a full flash image (all partitions including u-boot), not just a `digicap.dav`. Always dump the flash before making modifications.

The original firmware is at `firmware_extracted/digicap.dav` (kernel + app only, no u-boot).

## Platform reference

See [INTERNALS.md](INTERNALS.md) for detailed notes on the camera hardware, boot sequence, initramfs contents, SSH/firewall architecture, cross-compilation, and web UI internals.

## License

Public domain. Use at your own risk. Modifying camera firmware may void your warranty and could brick your device.
