# IPC R2 Platform Internals

Research notes on the DS-2CD2420F-IW (V5.4.800) internals. Useful when making CramFS modifications.

## Hardware

| Field | Value |
|-------|-------|
| Model | DS-2CD2420F-IW |
| SoC | HiSilicon Hi3518E |
| Architecture | ARM 32-bit (ARMv5TE) |
| Kernel | Linux 3.0.8 |
| C library | uClibc 0.9.32.1 |
| WiFi chipset | Realtek RTL8188EU (USB) |
| WiFi driver | 8188eu.ko |
| Root shell | `/bin/psh` (custom shell, not standard sh) |
| Root password | `hiklinux` (DES crypt hash `ToCOv8qxP13qs` in `/etc/passwd`) |

## Boot sequence

1. **u-boot** loads uImage from MTD kernel partition
2. **Kernel** decompresses, mounts initramfs (embedded in uImage as gzip cpio)
3. **`/etc/init.d/rcS`** runs:
   - Mounts `/proc`, `/sys`, `/home` (ramfs)
   - `iptables -A INPUT -p tcp --dport 22 -j DROP` (blocks SSH by default)
   - Calls `/etc/app`
4. **`/etc/app`** runs:
   - Starts udev
   - **Starts `/sbin/dropbear -R -I 1800`** (system SSH server, runs before anything else)
   - Mounts CramFS from `/dev/mtdblock5` to `/mnt`
   - Copies `initrun.sh` from CramFS to `/home/`
   - Runs `/home/initrun.sh`
5. **`initrun.sh`** (from CramFS, the main customization point):
   - Sets up network interfaces
   - Mounts CramFS to `/dav`
   - Decompresses and installs binaries
   - Mounts jffs2 config partition at `/devinfo`
   - Loads kernel modules
   - Starts `execSystemCmd`, `daemon_fsp_app`, `database_process`, `net_process`
   - Extracts web UI (IEfile.tar.gz) to `/home/webLib`

Key implications:
- The initramfs is in RAM (ramfs), so `/sbin/dropbear` can be overwritten at runtime
- `/sbin/dropbear` starts BEFORE `initrun.sh` runs. You cannot prevent it from starting.
- `/var/run` does not exist when dropbear starts, so no PID file is created
- To replace dropbear at runtime: kill by process name, `rm` the old binary (ETXTBSY prevents `cp` over a running binary), then `cp` the new one

## Initramfs contents

The kernel initramfs (embedded in uImage) contains the rootfs. Key contents:

```
/bin/busybox          - Standard utilities (ls, cp, ps, kill, tar, gzip, lzma, etc.)
/bin/psh              - Custom HiSilicon shell (root's login shell)
/sbin/dropbear        - SSH server (dropbear 2016.74, dynamically linked against uClibc)
/sbin/iptables        - Firewall management
/sbin/ip6tables       - IPv6 firewall
/sbin/xtables-multi   - Underlying iptables binary
/lib/libuClibc-*      - uClibc C library
/lib/libcrypt-*       - Used by busybox
/lib/libm-*           - Used by busybox, xtables
/lib/libz-*           - Only used by old dropbear (removable if dropbear is replaced with static build)
/lib/libstdc++-*      - Unused (removable)
/lib/libpthread-*     - Unused (removable)
/lib/libgcc_s-*       - Unused (removable)
/etc/passwd           - root:ToCOv8qxP13qs:0:0:root:/root/:/bin/psh
/etc/init.d/rcS       - Init script
/etc/app              - Application startup script
```

## MTD partition layout

| Partition | Mount point | Filesystem | Description |
|-----------|-------------|------------|-------------|
| mtdblock5 | `/dav` (also `/mnt` briefly) | CramFS (read-only) | Application filesystem |
| mtdblock6 | `/devinfo` | jffs2 (read-write) | Persistent configuration |

The jffs2 partition at `/devinfo` survives firmware updates and stores:
- `ipc_db` - SQLite database with device configuration
- `dropbear_*_host_key` - SSH host keys (if SSH was enabled)
- `authorized_keys` - SSH public keys (optional override)

## SSH and the firewall

SSH access involves two components:

### Firewall (iptables)

Port 22 is **blocked by default** in `/etc/init.d/rcS`:
```sh
iptables -A INPUT -p tcp --dport 22 -j DROP
```

`net_process` manages the firewall at runtime based on the SQLite database at `/devinfo/ipc_db`. The `security_config` table has an `ssh_enable` field. When `ssh_enable=1`, `net_process` removes the DROP rule for port 22.

To set this flag, a static ARM binary (`ssh_enable`) is needed that opens the database and runs:
```sql
UPDATE security_config SET ssh_enable=1 WHERE idx=1;
```

This must run BEFORE `net_process` starts, as `net_process` reads the value at startup.

### Dropbear SSH server

The system dropbear (2016.74) is started by `/etc/app` before `initrun.sh` runs. To replace it with a newer version from initrun.sh:

```sh
# 1. Decompress new dropbear from CramFS
cp /dav/dropbearmulti.lzma /home/dropbearmulti.lzma
cd /home && lzma -df dropbearmulti.lzma && chmod +x /home/dropbearmulti

# 2. Kill old dropbear by process name (no PID file exists)
for pid in $(ps | grep '[d]ropbear' | awk '{print $1}'); do kill $pid 2>/dev/null; done
sleep 1

# 3. Replace binary (must rm first due to ETXTBSY)
rm -f /sbin/dropbear
cp /home/dropbearmulti /sbin/dropbear

# 4. Set up keys and restart
mkdir -p /root/.ssh
cp /dav/authorized_keys /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
/sbin/dropbear -r /devinfo/dropbear_ed25519_host_key -p 22 &
```

## Cross-compilation notes

The camera runs uClibc, not glibc. A static binary built with glibc will crash at runtime because glibc's NSS (Name Service Switch) tries to dynamically load `libnss_files.so` even in static builds (for `getpwnam()`, `getpwuid()` etc.). **You must use musl for static ARM builds.**

### Building dropbear

```sh
# Download musl ARM cross-compiler
wget https://musl.cc/arm-linux-musleabi-cross.tgz
tar xzf arm-linux-musleabi-cross.tgz

# Download dropbear
wget https://matt.ucc.asn.au/dropbear/releases/dropbear-2025.89.tar.bz2
tar xjf dropbear-2025.89.tar.bz2
cd dropbear-2025.89

# Configure for ed25519 only, no password auth
cat > localoptions.h << 'EOF'
#define DROPBEAR_SVR_PASSWORD_AUTH 0
#define DROPBEAR_RSA 0
#define DROPBEAR_DSS 0
#define DROPBEAR_ECDSA 0
#define DROPBEAR_ED25519 1
EOF

CC=/path/to/arm-linux-musleabi-cross/bin/arm-linux-musleabi-gcc
./configure --host=arm-linux-musleabi \
    --disable-zlib --disable-lastlog --disable-utmp \
    --disable-utmpx --disable-wtmp --disable-wtmpx \
    --disable-pututline --disable-pututxline \
    --enable-static \
    CC=$CC \
    AR=${CC/gcc/ar} RANLIB=${CC/gcc/ranlib} STRIP=${CC/gcc/strip} \
    CFLAGS="-Os -march=armv5te" LDFLAGS="-static"
make PROGRAMS="dropbear dropbearkey" MULTI=1 STATIC=1 -j$(nproc)
arm-linux-musleabi-strip dropbearmulti
lzma -9 -k dropbearmulti
# Result: ~147KB compressed, ~347KB stripped
```

Note: `localoptions.h` must be in the build root directory, not in `src/`. The Makefile checks `$(wildcard ./localoptions.h)`.

### Building ssh_enable

```sh
wget https://sqlite.org/2024/sqlite-amalgamation-3460100.zip
unzip sqlite-amalgamation-3460100.zip
```

`ssh_enable.c`:
```c
#include "sqlite3.h"
#include <stdio.h>
int main(void) {
    sqlite3 *db;
    if (sqlite3_open("/devinfo/ipc_db", &db) != SQLITE_OK) {
        puts("open failed");
        return 1;
    }
    sqlite3_exec(db, "UPDATE security_config SET ssh_enable=1 WHERE idx=1", 0, 0, 0);
    sqlite3_close(db);
    puts("ssh_enable=1");
    return 0;
}
```

```sh
arm-linux-musleabi-gcc -Os -march=armv5te -static \
    -DSQLITE_OMIT_LOAD_EXTENSION -DSQLITE_THREADSAFE=0 \
    -o ssh_enable ssh_enable.c sqlite-amalgamation-3460100/sqlite3.c \
    -Isqlite-amalgamation-3460100 -lm -lpthread
arm-linux-musleabi-strip ssh_enable
lzma -9 -k ssh_enable
# Result: ~296KB compressed, ~672KB stripped
```

## uImage structure

The uImage is a standard u-boot image wrapping a Linux ARM zImage:

```
[64-byte u-boot header] [ARM zImage]
```

The zImage contains:
- ARM decompression stub (first ~7KB)
- LZMA-compressed kernel (offset 0x1C5B to end)

The stub has two 32-bit LE words referencing the zImage end offset (at byte offsets 44 and 392). These must be updated if the compressed payload size changes.

Inside the decompressed kernel (vmlinux), at offset 115148 (0x1C1CC):
- gzip-compressed cpio archive (the initramfs)
- Original size: 1,716,384 bytes compressed, 3,873,792 bytes decompressed

**Warning:** Modifying the uImage and flashing it WILL replace the kernel on the camera. If the modified kernel doesn't boot, the camera is bricked. The DS-2CD2420F-IW has no UART headers or test pads, so recovery requires a SPI flash programmer (see README.md).

## Web UI notes

- **SeaJS module system**: `common.js` detects page name from URL, loads page module via `require.async()`
- **jQuery Layout plugin**: required by `common.js` (`require("layout")`). Preview page must include `.layout-center`, `.layout-center-inner`, `.layout-south-inner` divs or it throws "center-pane element does not exist"
- **Authentication**: HTTP Basic auth. Credentials stored in `sessionStorage.userInfo` as `base64("user:password")`. Accessible via `common.m_szNamePwd`. Use `base64.decode()` + `utils.parseNamePwd()` to extract username/password.
- **Snapshot endpoint**: `/ISAPI/Streaming/channels/101/picture` returns JPEG (1280x720). Requires HTTP Basic auth. Use XHR with `xhr.open("GET", url, true, username, password)` for browser-native auth.
- **RTSP**: `rtsp://host:554/ISAPI/streaming/channels/101`
- **Language packs**: 26 non-English translations in `doc/i18n/`. English comes from `IElang.tar` (40KB, in CramFS root, separate from IEfile). `Languages.json` controls the language dropdown.

## WiFi notes

- `net_process` is the core networking daemon with embedded wpa_supplicant v2.6
- No application-level reconnection watchdog exists in the original firmware
- RTL8188EU driver power save (IPS/LPS) is a known cause of WiFi drops. Disable with: `echo 0 > /proc/net/rtl8188eu/wlan0/ips_mode` and `echo 0 > /proc/net/rtl8188eu/wlan0/lps_mode`
