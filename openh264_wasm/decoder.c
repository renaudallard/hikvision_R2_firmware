/*
 * Minimal OpenH264 WASM decoder wrapper.
 * Exports: init_decoder, decode_nal, get_width, get_height, get_yuv, deinit_decoder
 */
#include <string.h>
#include <semaphore.h>
#include <time.h>
#include "wels/codec_api.h"
#include "wels/codec_def.h"

/* Stub: sem_timedwait is not available in Emscripten without pthreads.
 * The decoder threading code path is never taken in single-threaded WASM. */
int sem_timedwait(sem_t *sem, const struct timespec *ts) {
    (void)sem; (void)ts;
    return -1;
}

static ISVCDecoder *dec;
static int out_w, out_h;
static unsigned char *yuv_planes[3];
static int yuv_strides[3];
static int have_frame;

/* Pack YUV420 planes into a contiguous buffer: Y then U then V */
static unsigned char yuv_buf[3840 * 2160 * 3 / 2]; /* max 4K */

int init_decoder(void) {
    if (WelsCreateDecoder(&dec) != 0 || !dec)
        return -1;
    SDecodingParam param;
    memset(&param, 0, sizeof(param));
    param.sVideoProperty.eVideoBsType = VIDEO_BITSTREAM_AVC;
    param.eEcActiveIdc = ERROR_CON_SLICE_COPY;
    if ((*dec)->Initialize(dec, &param) != 0)
        return -2;
    out_w = out_h = 0;
    have_frame = 0;
    return 0;
}

/*
 * Feed a NAL unit WITH 4-byte start code (00 00 00 01 ...).
 * Returns 1 if a frame was decoded, 0 otherwise.
 */
int decode_nal(const unsigned char *data, int len) {
    unsigned char *dst[3] = {0};
    SBufferInfo info;
    memset(&info, 0, sizeof(info));
    have_frame = 0;

    DECODING_STATE st = (*dec)->DecodeFrameNoDelay(dec, data, len, dst, &info);
    if (st != dsErrorFree && st != dsFramePending)
        return 0;

    if (info.iBufferStatus == 1 && info.pDst[0]) {
        out_w = info.UsrData.sSystemBuffer.iWidth;
        out_h = info.UsrData.sSystemBuffer.iHeight;
        yuv_planes[0] = info.pDst[0];
        yuv_planes[1] = info.pDst[1];
        yuv_planes[2] = info.pDst[2];
        yuv_strides[0] = info.UsrData.sSystemBuffer.iStride[0];
        yuv_strides[1] = info.UsrData.sSystemBuffer.iStride[1];
        have_frame = 1;
        return 1;
    }
    return 0;
}

int get_width(void) { return out_w; }
int get_height(void) { return out_h; }

/*
 * Copy decoded YUV420 into a packed contiguous buffer and return pointer.
 * Layout: Y (w*h) + U (w/2*h/2) + V (w/2*h/2)
 */
unsigned char *get_yuv(void) {
    if (!have_frame || !out_w || !out_h)
        return 0;
    int y_sz = out_w * out_h;
    int uv_w = out_w / 2, uv_h = out_h / 2;
    int uv_sz = uv_w * uv_h;

    /* Copy Y */
    for (int j = 0; j < out_h; j++)
        memcpy(yuv_buf + j * out_w, yuv_planes[0] + j * yuv_strides[0], out_w);
    /* Copy U */
    for (int j = 0; j < uv_h; j++)
        memcpy(yuv_buf + y_sz + j * uv_w, yuv_planes[1] + j * yuv_strides[1], uv_w);
    /* Copy V */
    for (int j = 0; j < uv_h; j++)
        memcpy(yuv_buf + y_sz + uv_sz + j * uv_w, yuv_planes[2] + j * yuv_strides[1], uv_w);

    return yuv_buf;
}

void deinit_decoder(void) {
    if (dec) {
        (*dec)->Uninitialize(dec);
        WelsDestroyDecoder(dec);
        dec = 0;
    }
}
