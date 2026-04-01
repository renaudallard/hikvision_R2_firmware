# hikfw

[![Latest Release](https://img.shields.io/github/v/release/renaudallard/hikvision_R2_firmware?label=firmware&color=blue)](https://github.com/renaudallard/hikvision_R2_firmware/releases/latest)
[![License](https://img.shields.io/badge/license-public%20domain-green)](LICENSE)

Modern web interface and firmware toolkit for Hikvision IPC R2 cameras.

Replaces the original Internet Explorer-only ActiveX interface with a clean, dark-themed web UI that works on **any modern browser**. Pre-built firmware ready to flash on stock cameras.

Tested on **DS-2CD2420F-IW** (V5.4.800). The firmware is compatible with **all 145 IPC R2 models** including DS-2CD2020F, DS-2CD2120F, DS-2CD2420F-IW, DS-2CD2620F, DS-2CD2x32, DS-2CD2x42 series, and more.

---

# ![#3b82f6](https://placehold.co/12x12/3b82f6/3b82f6.png) Modified Firmware

## Download and Flash

Download `digicap.dav` from the **[Releases](https://github.com/renaudallard/hikvision_R2_firmware/releases/latest)** page, then flash using one of:

| Method | Steps |
|--------|-------|
| **Stock Hikvision UI** (IE) | Configuration > System > Maintenance > Upgrade, select file, click Upgrade |
| **New web UI** (any browser) | System > Firmware Upgrade, select file, click Upload and Upgrade |
| **Command line** | `curl -u 'admin:PASSWORD' -X PUT "http://CAMERA_IP/ISAPI/System/updateFirmware" --data-binary @digicap.dav` |

After reboot, the new web UI is accessible from any browser at `http://CAMERA_IP/`.

> **Warning:** A bad firmware bricks the camera and requires [TFTP recovery](#tftp-recovery).

## New Web UI Features

| Section | Details |
|---------|---------|
| **Live View** | Real-time JPEG snapshot stream, main/sub stream selector, screenshot capture, fullscreen |
| **Network** | IP address, DHCP/static, subnet, gateway, DNS |
| **WiFi** | Scan networks with signal strength bars, connect with password |
| **Ports** | HTTP, HTTPS, RTSP, SDK port configuration |
| **Video** | 3 streams (main/sub/third), codec, bitrate, frame rate, H.264 profile, quality type |
| **Image** | Brightness, contrast, saturation, sharpness sliders, WDR, IR cut filter, ISP day/night, mirror/flip |
| **OSD** | Date/time overlay, date format, display week, channel name overlay |
| **Audio** | Enable/disable audio channel |
| **Motion Detection** | Enable/disable, sensitivity slider |
| **PIR** | Sensor status and notification methods |
| **Email** | SMTP server, SSL/TLS, auth, sender, 3 receivers, snapshot attachment |
| **FTP** | Upload server, port, credentials, anonymous mode |
| **DDNS** | Provider, server, domain, credentials |
| **Time** | NTP or manual, NTP server, sync interval |
| **Users** | Change admin password |
| **Device Name** | Rename camera |
| **System** | Device info, firmware upgrade with progress bar, config backup/restore, reboot, storage |

## Other Firmware Changes

- **WiFi watchdog** - pings gateway every 30s, restarts networking after 3 failures, disables RTL8188EU power saving (IPS/LPS)
- **Smaller image** - removed unused language packs and ActiveX installers

## Compatibility

**145 camera models** - Hikvision ships one firmware for the entire IPC R2 platform. The `_cfgUpgClass` compatibility table in this firmware covers 145 device IDs across all R2 series (DS-2CD20xx, DS-2CD21xx, DS-2CD24xx, DS-2CD26xx, DS-2CDxx32, DS-2CDxx42, etc.).

**NVR/VMS** - RTSP, ONVIF, and ISAPI are untouched. Works normally with **Synology Surveillance Station**, **Blue Iris**, and any other NVR/VMS.

---

# ![#22c55e](https://placehold.co/12x12/22c55e/22c55e.png) Firmware Toolkit

`hikfw.py` is a standalone tool to unpack, inspect, modify, resign, and repack Hikvision SWKH firmware files. It works independently of the web UI project above.

## Install

```sh
git clone https://github.com/renaudallard/hikvision_R2_firmware.git
cd hikvision_R2_firmware
pip install cryptography
```

## Usage

```sh
python3 hikfw.py info digicap.dav                   # inspect
python3 hikfw.py unpack digicap.dav -o unpacked      # unpack
python3 hikfw.py repack unpacked -o modified.dav      # repack (auto-resigns)
python3 hikfw.py verify modified.dav                 # verify signatures
```

## Modifying the CramFS

```sh
# Extract
mkdir cramfs_root
/usr/sbin/fsck.cramfs --extract=cramfs_root unpacked/app.img

# Edit files...
vi cramfs_root/initrun.sh

# Rebuild
/usr/sbin/mkfs.cramfs -n r2_app cramfs_root unpacked/app.img
```

## IEfile.tar.gz (web UI packaging)

Despite the `.gz` extension, this file is LZMA-compressed. Two critical constraints:

- **Bare paths only** (no `./` prefix) or the camera silently fails to extract
- **LZMA dictionary 8MB max** (the camera has 64MB RAM total)

```sh
cd webui
tar cf - index.asp style.css app.js | xz --format=lzma --lzma1=dict=8MiB,lc=3,lp=0,pb=2 > IEfile.tar.gz
```

## Building the Modified Firmware

The build script takes a base firmware and replaces the web UI:

```sh
# Download the base firmware (contains WiFi watchdog and other non-UI mods)
gh release download v0.0.0-base -p 'firmware_base.dav'

# Build
./build_firmware.sh firmware_base.dav digicap.dav
```

**Requirements:** `util-linux-extra` (cramfs tools), `xz-utils`, Python 3 + `cryptography`

A GitHub Actions workflow automatically creates a release when `VERSION` changes.

## Web UI Source

Source in `webui/` (vanilla JS, no frameworks, no build step):

| File | Description |
|------|-------------|
| `index.asp` | HTML shell with all page layouts |
| `style.css` | Dark theme, CSS Grid |
| `app.js` | Application logic, ISAPI communication, live view |

The UI talks to the camera via ISAPI (XML over HTTP with Digest auth). Live view polls `/ISAPI/Streaming/channels/{id}/picture` for JPEG snapshots via XHR.

The kernel (`uImage`) is never modified.

---

# ![#ef4444](https://placehold.co/12x12/ef4444/ef4444.png) Recovery

The DS-2CD2420F-IW has **no UART pin headers**. There is a hidden screw behind the Hikvision sticker on the back.

## TFTP Recovery

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

## SPI Flash Programmer (last resort)

```sh
sudo apt install flashrom
flashrom -p ch341a_spi -r backup.bin     # backup first
flashrom -p ch341a_spi -w good_dump.bin  # restore
```

Requires a full flash image (all partitions including u-boot), not just `digicap.dav`.

---

# ![#9ca3af](https://placehold.co/12x12/9ca3af/9ca3af.png) Firmware Format Reference

<details>
<summary>SWKH header (240 bytes, XOR encrypted)</summary>

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

</details>

<details>
<summary>_cfgUpgSecPls signature</summary>

| Layer | Algorithm | Details |
|-------|-----------|---------|
| Outer | Raw | First 4 bytes = uint32 LE encrypted data length |
| Encryption | AES-256-ECB | Key from `EVP_BytesToKey(MD5, 2 iterations)` |
| Passphrase | | `h@k8807H$Z5998` + 17 null bytes |
| Salt | | `HangZhou` |
| Hashes | SHA-0 | Not SHA-1. Old OpenSSL `SHA_Init` implements SHA-0. |
| RSA | Stub | Always returns 0 |

</details>

<details>
<summary>Firmware layout</summary>

```
Offset     Size       Section
0x000      240 B      SWKH header (XOR encrypted)
0x0F0      500 B      _cfgUpgSecPls (AES-256-ECB encrypted SHA-0 hashes)
0x2E4      780 B      _cfgUpgClass (device compatibility table)
0x5F0      ~3.5 MB    uImage (Linux kernel, ARM zImage)
0x3586CC   ~7 MB      app.img (CramFS application filesystem)
```

</details>

---

## Platform Reference

See [INTERNALS.md](INTERNALS.md) for detailed notes on the camera hardware, boot sequence, initramfs, SSH/firewall architecture, and cross-compilation.

## License

Public domain. Use at your own risk. Modifying camera firmware may void your warranty and could brick your device.
