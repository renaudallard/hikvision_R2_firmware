#!/bin/sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BASE_FW="${1:-$SCRIPT_DIR/firmware_base.dav}"
OUTPUT="${2:-$SCRIPT_DIR/digicap.dav}"
WEBUI_DIR="$SCRIPT_DIR/webui"
WORK="$SCRIPT_DIR/.build"

if [ ! -f "$BASE_FW" ]; then
    echo "Usage: $0 <base_firmware.dav> [output.dav]"
    echo "Base firmware not found: $BASE_FW"
    exit 1
fi

echo "Building firmware from $BASE_FW"

# Clean
rm -rf "$WORK"
mkdir -p "$WORK/unpacked" "$WORK/iefiles"

# Unpack base firmware
python3 "$SCRIPT_DIR/hikfw.py" unpack "$BASE_FW" -o "$WORK/unpacked"

# Build IEfile.tar.gz from webui/ source
cp "$WEBUI_DIR/index.asp" "$WEBUI_DIR/style.css" "$WEBUI_DIR/app.js" "$WORK/iefiles/"
[ -f "$WEBUI_DIR/favicon.ico" ] && cp "$WEBUI_DIR/favicon.ico" "$WORK/iefiles/"
cd "$WORK/iefiles"
tar cf - $(ls) | xz --format=lzma --lzma1=dict=8MiB,lc=3,lp=0,pb=2 > "$WORK/ie_new.tar.gz"
cd "$SCRIPT_DIR"

# Detect firmware type: CramFS (R2) or flat files (R0)
if [ -f "$WORK/unpacked/app.img" ]; then
    echo "Detected CramFS firmware (IPC R2) - using LZMA"
    /usr/sbin/fsck.cramfs --extract="$WORK/cramfs" "$WORK/unpacked/app.img"
    cp "$WORK/ie_new.tar.gz" "$WORK/cramfs/IEfile.tar.gz"
    /usr/sbin/mkfs.cramfs -n r2_app "$WORK/cramfs" "$WORK/unpacked/app.img"
elif [ -f "$WORK/unpacked/IEfile.tar.gz" ]; then
    echo "Detected flat firmware (IPC R0/R6) - using gzip"
    cd "$WORK/iefiles"
    tar czf "$WORK/unpacked/IEfile.tar.gz" $(ls)
    cd "$SCRIPT_DIR"
else
    echo "Error: no app.img or IEfile.tar.gz found in unpacked firmware"
    exit 1
fi

# Repack firmware
python3 "$SCRIPT_DIR/hikfw.py" repack "$WORK/unpacked" -o "$OUTPUT"

# Verify
python3 "$SCRIPT_DIR/hikfw.py" verify "$OUTPUT"

# Clean
rm -rf "$WORK"

echo ""
echo "Firmware built: $OUTPUT ($(stat -c%s "$OUTPUT") bytes)"
