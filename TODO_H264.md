# H.264 Streaming

## Status

OpenH264 WASM decoder built and integrated. RTSP-over-HTTP tunnel feeds NAL
units to a single-threaded OpenH264 decoder (no pthreads, no SharedArrayBuffer,
works on plain HTTP).

### Architecture

```
Camera RTSP/TCP ─> rtsp.js (XHR tunnel, RTP demux, NAL reassembly)
                       ─> h264decoder.js (OpenH264 WASM wrapper)
                            ─> openh264.wasm (329KB, Cisco OpenH264)
                                 ─> YUV420 callback
                       ─> rtsp.js (BT.601 YUV->RGBA, putImageData)
```

### Files

- `openh264_wasm/decoder.c` - C wrapper (~100 lines) around OpenH264 decoder API
- `openh264_wasm/openh264.js` - Emscripten glue (12KB)
- `openh264_wasm/openh264.wasm` - OpenH264 decoder (329KB, no pthreads)
- `webui/h264decoder.js` - Browser-side H264Decoder class
- `webui/rtsp.js` - RTSP-over-HTTP tunnel + RTP/NAL handling
- `webui/index.asp` - Loads openh264.js, h264decoder.js, rtsp.js, app.js

### Build

Requires Emscripten SDK in `emsdk/` and OpenH264 source in `openh264/`.
Both are gitignored. To rebuild the WASM:

```sh
source emsdk/emsdk_env.sh
cd openh264 && make -j$(nproc) libopenh264.a OS=linux ARCH= CC=emcc CXX=em++ CFLAGS="-O2" CXXFLAGS="-O2"
cd ..
emcc -O2 -I openh264/codec/api openh264_wasm/decoder.c openh264/libopenh264.a \
  -s EXPORTED_FUNCTIONS='["_init_decoder","_decode_nal","_get_width","_get_height","_get_yuv","_deinit_decoder","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["cwrap"]' \
  -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=16777216 -s NO_FILESYSTEM=1 \
  -s MODULARIZE=1 -s EXPORT_NAME='OpenH264' -s ENVIRONMENT='web' \
  -o openh264_wasm/openh264.js
```

## TODO

- [ ] Test on actual camera hardware (R2 and R0)
- [ ] Measure FPS with OpenH264 vs old TinyH264 (expect 15-30 fps)
- [ ] Remove old Decoder.js and YUVCanvas.js from webui/ after confirming
- [ ] Consider sub stream Baseline vs Main profile performance
