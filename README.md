# hikfw

Unpack, modify, resign, and repack Hikvision IPC R2 series firmware.

Tested on **DS-2CD2420F-IW** (V5.4.800 build 210813). Should work on other IPC R2 models using the SWKH firmware format.

---

## Modified firmware

Pre-built firmware ready to flash is on the [Releases](https://github.com/renaudallard/hikvision_R2_firmware/releases) page. Works on stock cameras.

### What's included

**Modern web UI** replacing the original IE-only ActiveX interface

| Feature | Details |
|---------|---------|
| Live view | JPEG snapshot polling, main/sub stream, capture, fullscreen |
| Configuration | Network, WiFi, ports, video (3 streams), image, OSD, audio, motion detection, PIR, email, FTP, DDNS, time, users, device name |
| System | Device info, firmware upgrade, config backup/restore, reboot |
| Compatibility | Firefox, Chrome, Safari, Edge |
| Size | 3 files / 37KB (replaces 600+ files / 1.2MB) |

**WiFi watchdog** pings gateway every 30s, restarts networking after 3 failures, disables RTL8188EU power saving (IPS/LPS)

**Smaller firmware** by removing unused language packs and ActiveX installers

### Compatibility

RTSP, ONVIF, and ISAPI are untouched. The camera works normally with Synology Surveillance Station, Blue Iris, and any other NVR/VMS software.

### Flash

From the web UI: **System > Firmware Upgrade**, select `digicap.dav`, upload.

From the command line:
```sh
curl -u 'admin:PASSWORD' -X PUT \
  "http://CAMERA_IP/ISAPI/System/updateFirmware" \
  --data-binary @digicap.dav \
  -H "Content-Type: application/octet-stream"
```

> **Warning:** A bad firmware bricks the camera and requires TFTP recovery. See [Recovery](#recovery).

---

## Toolkit

`hikfw.py` unpacks, repacks, and resigns Hikvision SWKH firmware files.

### Install

```sh
git clone https://github.com/renaudallard/hikvision_R2_firmware.git
cd hikvision_R2_firmware
pip install cryptography
```

### Quick start

```sh
python3 hikfw.py info digicap.dav        # inspect
python3 hikfw.py unpack digicap.dav -o unpacked  # unpack
python3 hikfw.py repack unpacked -o modified.dav  # repack (auto-resigns)
python3 hikfw.py verify modified.dav     # verify signatures
```

### Modifying the CramFS

```sh
# Extract
mkdir cramfs_root
/usr/sbin/fsck.cramfs --extract=cramfs_root unpacked/app.img

# Edit files...
vi cramfs_root/initrun.sh

# Rebuild
/usr/sbin/mkfs.cramfs -n r2_app cramfs_root unpacked/app.img
```

### IEfile.tar.gz (web UI)

Despite the `.gz` extension, this file is LZMA-compressed. Two critical constraints:

- **Bare paths only** (no `./` prefix) or the camera silently fails to extract
- **LZMA dictionary 8MB max** (the camera has 64MB RAM total)

```sh
cd webui
tar cf - index.asp style.css app.js | xz --format=lzma --lzma1=dict=8MiB,lc=3,lp=0,pb=2 > IEfile.tar.gz
```

---

## Building firmware

The build script takes a base firmware and replaces the web UI.

**Requirements:** `util-linux-extra` (cramfs tools), `xz-utils`, Python 3 + `cryptography`

```sh
# Download the base firmware (contains WiFi watchdog and other non-UI mods)
gh release download v0.0.0-base -p 'firmware_base.dav'

# Build
./build_firmware.sh firmware_base.dav digicap.dav
```

### Automated releases

A GitHub Actions workflow creates a release when `VERSION` changes. To release: bump `VERSION`, commit, push.

---

## Web UI source

Source files in `webui/`:

| File | Description |
|------|-------------|
| `index.asp` | HTML shell with all page layouts |
| `style.css` | Dark theme, CSS Grid |
| `app.js` | Application logic, ISAPI communication, live view |

The UI communicates with the camera via ISAPI (XML over HTTP with Digest auth). Video is displayed by polling `/ISAPI/Streaming/channels/{id}/picture` for JPEG snapshots via XHR.

The kernel (`uImage`) is never modified.

---

## Recovery

The DS-2CD2420F-IW has **no UART pin headers**. There is a hidden screw behind the Hikvision sticker on the back.

### TFTP recovery

The Hi3518E u-boot has built-in TFTP recovery that works even with a corrupted kernel or CramFS.

1. Connect camera directly via ethernet
2. Configure the recovery IPs:
   ```sh
   sudo ip addr add 192.0.0.128/24 dev eth0
   sudo ip addr add 192.168.1.128/24 dev eth0
   ```
3. Start the TFTP server:
   ```sh
   gh release download v5.4.800-recovery
   sudo ./hikvision_tftpd.py digicap.dav
   ```
4. Hold reset button, power on the camera, keep holding 10+ seconds
5. Wait 3-5 minutes for the transfer and reflash

| Camera IP | TFTP server IP |
|-----------|----------------|
| 192.0.0.64 | 192.0.0.128 |
| 192.168.1.64 | 192.168.1.128 |

The address pair is hardcoded in u-boot and varies by model. Use `tcpdump -i eth0 arp` if neither works.

The camera uses a proprietary handshake on UDP 9978/9979 before standard TFTP (port 69). The included `hikvision_tftpd.py` (based on [scottlamb/hikvision-tftpd](https://github.com/scottlamb/hikvision-tftpd)) handles both.

### SPI flash programmer (last resort)

```sh
sudo apt install flashrom
flashrom -p ch341a_spi -r backup.bin     # backup first
flashrom -p ch341a_spi -w good_dump.bin  # restore
```

Requires a full flash image (all partitions including u-boot), not just `digicap.dav`.

---

## Firmware format

### SWKH header (240 bytes, XOR encrypted)

| Offset | Size | Field |
|--------|------|-------|
| 0x00 | 4 | Magic `SWKH` |
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

XOR key: `BA CD BC FE D6 CA DD D3 BA B9 A3 AB BF CB B5 BE`, index: `(i + (i >> 4)) & 0xF`

### _cfgUpgSecPls signature

| Layer | Algorithm | Details |
|-------|-----------|---------|
| Outer | Raw | First 4 bytes = uint32 LE encrypted data length |
| Encryption | AES-256-ECB | Key from `EVP_BytesToKey(MD5, 2 iterations)` |
| Passphrase | | `h@k8807H$Z5998` + 17 null bytes |
| Salt | | `HangZhou` |
| Hashes | SHA-0 | Not SHA-1. Old OpenSSL `SHA_Init` implements SHA-0. |
| RSA | Stub | Always returns 0 |

### Firmware layout

```
Offset     Size       Section
0x000      240 B      SWKH header (XOR encrypted)
0x0F0      500 B      _cfgUpgSecPls (AES-256-ECB encrypted SHA-0 hashes)
0x2E4      780 B      _cfgUpgClass (device compatibility table)
0x5F0      ~3.5 MB    uImage (Linux kernel, ARM zImage)
0x3586CC   ~7 MB      app.img (CramFS application filesystem)
```

---

## Platform reference

See [INTERNALS.md](INTERNALS.md) for detailed notes on the camera hardware, boot sequence, initramfs, SSH/firewall architecture, and cross-compilation.

## License

Public domain. Use at your own risk. Modifying camera firmware may void your warranty and could brick your device.
