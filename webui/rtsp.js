/*
 * RTSP-over-HTTP tunnel client for Hikvision cameras.
 * Streams H.264 via RTP/TCP interleaved, decodes with OpenH264 WASM.
 */
var RTSPStream = (function() {
  'use strict';

  function md5(str) {
    function md5cycle(x, k) {
      var a = x[0], b = x[1], c = x[2], d = x[3];
      a=ff(a,b,c,d,k[0],7,-680876936);d=ff(d,a,b,c,k[1],12,-389564586);c=ff(c,d,a,b,k[2],17,606105819);b=ff(b,c,d,a,k[3],22,-1044525330);
      a=ff(a,b,c,d,k[4],7,-176418897);d=ff(d,a,b,c,k[5],12,1200080426);c=ff(c,d,a,b,k[6],17,-1473231341);b=ff(b,c,d,a,k[7],22,-45705983);
      a=ff(a,b,c,d,k[8],7,1770035416);d=ff(d,a,b,c,k[9],12,-1958414417);c=ff(c,d,a,b,k[10],17,-42063);b=ff(b,c,d,a,k[11],22,-1990404162);
      a=ff(a,b,c,d,k[12],7,1804603682);d=ff(d,a,b,c,k[13],12,-40341101);c=ff(c,d,a,b,k[14],17,-1502002290);b=ff(b,c,d,a,k[15],22,1236535329);
      a=gg(a,b,c,d,k[1],5,-165796510);d=gg(d,a,b,c,k[6],9,-1069501632);c=gg(c,d,a,b,k[11],14,643717713);b=gg(b,c,d,a,k[0],20,-373897302);
      a=gg(a,b,c,d,k[5],5,-701558691);d=gg(d,a,b,c,k[10],9,38016083);c=gg(c,d,a,b,k[15],14,-660478335);b=gg(b,c,d,a,k[4],20,-405537848);
      a=gg(a,b,c,d,k[9],5,568446438);d=gg(d,a,b,c,k[14],9,-1019803690);c=gg(c,d,a,b,k[3],14,-187363961);b=gg(b,c,d,a,k[8],20,1163531501);
      a=gg(a,b,c,d,k[13],5,-1444681467);d=gg(d,a,b,c,k[2],9,-51403784);c=gg(c,d,a,b,k[7],14,1735328473);b=gg(b,c,d,a,k[12],20,-1926607734);
      a=hh(a,b,c,d,k[5],4,-378558);d=hh(d,a,b,c,k[8],11,-2022574463);c=hh(c,d,a,b,k[11],16,1839030562);b=hh(b,c,d,a,k[14],23,-35309556);
      a=hh(a,b,c,d,k[1],4,-1530992060);d=hh(d,a,b,c,k[4],11,1272893353);c=hh(c,d,a,b,k[7],16,-155497632);b=hh(b,c,d,a,k[10],23,-1094730640);
      a=hh(a,b,c,d,k[13],4,681279174);d=hh(d,a,b,c,k[0],11,-358537222);c=hh(c,d,a,b,k[3],16,-722521979);b=hh(b,c,d,a,k[6],23,76029189);
      a=hh(a,b,c,d,k[9],4,-640364487);d=hh(d,a,b,c,k[12],11,-421815835);c=hh(c,d,a,b,k[15],16,530742520);b=hh(b,c,d,a,k[2],23,-995338651);
      a=ii(a,b,c,d,k[0],6,-198630844);d=ii(d,a,b,c,k[7],10,1126891415);c=ii(c,d,a,b,k[14],15,-1416354905);b=ii(b,c,d,a,k[5],21,-57434055);
      a=ii(a,b,c,d,k[12],6,1700485571);d=ii(d,a,b,c,k[3],10,-1894986606);c=ii(c,d,a,b,k[10],15,-1051523);b=ii(b,c,d,a,k[1],21,-2054922799);
      a=ii(a,b,c,d,k[8],6,1873313359);d=ii(d,a,b,c,k[15],10,-30611744);c=ii(c,d,a,b,k[6],15,-1560198380);b=ii(b,c,d,a,k[13],21,1309151649);
      a=ii(a,b,c,d,k[4],6,-145523070);d=ii(d,a,b,c,k[11],10,-1120210379);c=ii(c,d,a,b,k[2],15,718787259);b=ii(b,c,d,a,k[9],21,-343485551);
      x[0]=add32(a,x[0]);x[1]=add32(b,x[1]);x[2]=add32(c,x[2]);x[3]=add32(d,x[3]);
    }
    function cmn(q,a,b,x,s,t){a=add32(add32(a,q),add32(x,t));return add32((a<<s)|(a>>>(32-s)),b);}
    function ff(a,b,c,d,x,s,t){return cmn((b&c)|((~b)&d),a,b,x,s,t);}
    function gg(a,b,c,d,x,s,t){return cmn((b&d)|(c&(~d)),a,b,x,s,t);}
    function hh(a,b,c,d,x,s,t){return cmn(b^c^d,a,b,x,s,t);}
    function ii(a,b,c,d,x,s,t){return cmn(c^(b|(~d)),a,b,x,s,t);}
    function add32(a,b){return(a+b)&0xFFFFFFFF;}
    function md5blk(s){var r=[],i;for(i=0;i<64;i+=4)r[i>>2]=s.charCodeAt(i)+(s.charCodeAt(i+1)<<8)+(s.charCodeAt(i+2)<<16)+(s.charCodeAt(i+3)<<24);return r;}
    function rhex(n){var s='',j,h='0123456789abcdef';for(j=0;j<4;j++)s+=h.charAt((n>>(j*8+4))&0xF)+h.charAt((n>>(j*8))&0xF);return s;}
    function hex(x){for(var i=0;i<x.length;i++)x[i]=rhex(x[i]);return x.join('');}
    var n=str.length,st=[1732584193,-271733879,-1732584194,271733878],i;
    for(i=64;i<=n;i+=64)md5cycle(st,md5blk(str.substring(i-64,i)));
    str=str.substring(i-64);var t=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
    for(i=0;i<str.length;i++)t[i>>2]|=str.charCodeAt(i)<<((i%4)<<3);
    t[i>>2]|=0x80<<((i%4)<<3);if(i>55){md5cycle(st,t);for(i=0;i<16;i++)t[i]=0;}
    t[14]=n*8;md5cycle(st,t);return hex(st);
  }

  function digestAuth(user,pass,realm,nonce,method,uri) {
    var ha1=md5(user+':'+realm+':'+pass), ha2=md5(method+':'+uri);
    return 'Authorization: Digest username="'+user+'", realm="'+realm+'", nonce="'+nonce+'", uri="'+uri+'", response="'+md5(ha1+':'+nonce+':'+ha2)+'"';
  }

  function RTSPStream(opts) {
    this.host = opts.host;
    this.user = opts.user;
    this.pass = opts.pass;
    this.channel = opts.channel || '102';
    this.canvas = opts.canvas;
    this.onStatus = opts.onStatus || function(){};
    this.onError = opts.onError || function(){};
    this.onFps = opts.onFps || function(){};
    this.running = false;
    this._getXhr = null;
    this._fuBuf = null;
    this._fuLen = 0;
  }

  RTSPStream.prototype.start = function() {
    var self = this;
    if (location.protocol === 'https:') {
      self.onError('H.264 stream requires HTTP access. Switch to http:// or use JPEG mode.');
      return;
    }
    if (typeof H264Decoder === 'undefined') {
      self.onError('H.264 decoder not loaded. Use JPEG mode.');
      return;
    }
    self.running = true;
    self.onStatus('Initializing decoder...');

    var ctx = self.canvas.getContext('2d');
    self._imgData = null;
    self._spsData = null;
    self._ppsData = null;

    self._decoder = new H264Decoder(function(yuv, width, height) {
      if (!self.running) return;
      if (self.canvas.width !== width || self.canvas.height !== height) {
        self.canvas.width = width;
        self.canvas.height = height;
        self._imgData = null;
      }
      if (!self._imgData) self._imgData = ctx.createImageData(width, height);
      var rgba = self._imgData.data;
      var yLen = width * height;
      var uvLen = (width >> 1) * (height >> 1);
      for (var j = 0; j < height; j++) {
        for (var i = 0; i < width; i++) {
          var yIdx = j * width + i;
          var uvIdx = (j >> 1) * (width >> 1) + (i >> 1);
          var y = yuv[yIdx];
          var u = yuv[yLen + uvIdx] - 128;
          var v = yuv[yLen + uvLen + uvIdx] - 128;
          var r = y + 1.402 * v;
          var g = y - 0.344 * u - 0.714 * v;
          var b = y + 1.772 * u;
          var off = yIdx * 4;
          rgba[off] = r < 0 ? 0 : r > 255 ? 255 : r;
          rgba[off+1] = g < 0 ? 0 : g > 255 ? 255 : g;
          rgba[off+2] = b < 0 ? 0 : b > 255 ? 255 : b;
          rgba[off+3] = 255;
        }
      }
      ctx.putImageData(self._imgData, 0, 0);
      self.frameCount++;
    });
    self.frameCount = 0;
    self.lastFpsTime = Date.now();
    self.fpsTimer = setInterval(function() {
      var now = Date.now(), elapsed = (now - self.lastFpsTime) / 1000;
      self.onFps(elapsed > 0 ? (self.frameCount / elapsed).toFixed(1) : '0');
      self.frameCount = 0; self.lastFpsTime = now;
    }, 2000);
    self._connect();
  };

  RTSPStream.prototype.stop = function() {
    this.running = false;
    // Send TEARDOWN before closing the tunnel so camera releases the session
    if (this._teardown) { try { this._teardown(); } catch(e) {} }
    if (this._getXhr) { this._getXhr.abort(); this._getXhr = null; }
    this._decoder = null;
    this._teardown = null;
    clearInterval(this.fpsTimer);
    this.onFps('');
  };

  RTSPStream.prototype._connect = function() {
    var self = this;
    var authUrl = location.protocol + '//' + self.user + ':' + encodeURIComponent(self.pass) + '@' + self.host;
    var tunnelPath = '/ISAPI/streaming/channels/' + self.channel;
    var rtspUri = 'rtsp://' + self.host.split(':')[0] + ':554/ISAPI/streaming/channels/' + self.channel + '/';
    var sessionCookie = btoa('hik' + Date.now());
    var cseq = 0;
    var buffer = new Uint8Array(0);
    var state = 'describe_unauth';
    var realm = '', nonce = '', sessionId = '';
    var textBuf = '';
    var processedBytes = 0;
    function postRtsp(msg) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', authUrl + tunnelPath, true);
      xhr.setRequestHeader('x-sessioncookie', sessionCookie);
      xhr.setRequestHeader('Content-Type', 'application/x-rtsp-tunnelled');
      xhr.setRequestHeader('Pragma', 'no-cache');
      xhr.send(btoa(msg));
    }

    function rtspMsg(method, uri, extra) {
      cseq++;
      return method + ' ' + uri + ' RTSP/1.0\r\nCSeq: ' + cseq + '\r\nUser-Agent: hikwebui\r\n' + (extra || '') + '\r\n';
    }

    self.onStatus('Connecting...');

    // GET channel via XHR with credentials in URL.
    // Use responseType='' (text) and read responseText incrementally via onprogress.
    // Binary data arrives as latin1 characters (each byte 0-255 maps to a char code).
    var getXhr = new XMLHttpRequest();
    self._getXhr = getXhr;
    getXhr.open('GET', authUrl + tunnelPath, true);
    getXhr.setRequestHeader('x-sessioncookie', sessionCookie);
    getXhr.setRequestHeader('Accept', 'application/x-rtsp-tunnelled');
    getXhr.setRequestHeader('Pragma', 'no-cache');
    getXhr.overrideMimeType('text/plain; charset=x-user-defined');

    getXhr.onprogress = function() {
      if (!self.running) return;
      var text = getXhr.responseText;
      if (text.length <= processedBytes) return;
      var newText = text.substring(processedBytes);
      processedBytes = text.length;
      // Convert latin1 string to Uint8Array
      var bytes = new Uint8Array(newText.length);
      for (var i = 0; i < newText.length; i++) bytes[i] = newText.charCodeAt(i) & 0xFF;
      processChunk(bytes);

      // Prevent memory buildup
      if (processedBytes > 10 * 1024 * 1024) {
        getXhr.abort();
        processedBytes = 0;
        buffer = new Uint8Array(0);
        if (self.running) self._connect();
      }
    };

    getXhr.onerror = function() { if (self.running) self.onError('Connection lost'); };
    getXhr.send();

    // Send DESCRIBE after a short delay to allow the GET tunnel to establish
    // (browser needs time to complete the Digest auth challenge-response)
    setTimeout(function() {
      if (!self.running) return;
      self.onStatus('Negotiating...');
      postRtsp(rtspMsg('DESCRIBE', rtspUri, 'Accept: application/sdp\r\n'));
    }, 1000);

    function appendBuf(a, b) {
      var c = new Uint8Array(a.length + b.length);
      c.set(a); c.set(b, a.length); return c;
    }

    function processChunk(chunk) {
      buffer = appendBuf(buffer, chunk);
      while (buffer.length > 0) {
        if (state !== 'streaming') {
          var i = 0, text = '';
          while (i < buffer.length && buffer[i] !== 0x24) { text += String.fromCharCode(buffer[i]); i++; }
          if (text.length > 0) { buffer = buffer.subarray(i); processText(text); }
          if (buffer.length === 0 || buffer[0] !== 0x24) break;
          if (state !== 'streaming') { state = 'streaming'; self.onStatus(''); }
        }
        if (buffer.length < 4) break;
        if (buffer[0] !== 0x24) { buffer = buffer.subarray(1); continue; }
        var len = (buffer[2] << 8) | buffer[3];
        if (buffer.length < 4 + len) break;
        if (buffer[1] === 0) processRtp(buffer.subarray(4, 4 + len));
        buffer = buffer.subarray(4 + len);
      }
    }

    function processText(text) {
      textBuf += text;
      var parts = textBuf.split('\r\n\r\n');
      if (parts.length < 2) return;
      var hdr = parts[0];
      var clm = hdr.match(/Content-Length:\s*(\d+)/i);
      var bodyLen = clm ? parseInt(clm[1]) : 0;
      var rest = parts.slice(1).join('\r\n\r\n');
      if (bodyLen > 0 && rest.length < bodyLen) return;
      var resp = hdr + '\r\n\r\n' + (bodyLen > 0 ? rest.substring(0, bodyLen) : '');
      textBuf = bodyLen > 0 ? rest.substring(bodyLen) : rest;
      handleRtsp(resp);
    }

    function handleRtsp(resp) {
      if (state === 'describe_unauth') {
        var m = resp.match(/realm="([^"]+)"[\s\S]*?nonce="([^"]+)"/);
        if (m) { realm = m[1]; nonce = m[2]; state = 'describe_auth'; self.onStatus('Authenticating...');
          postRtsp(rtspMsg('DESCRIBE', rtspUri, digestAuth(self.user, self.pass, realm, nonce, 'DESCRIBE', rtspUri) + '\r\nAccept: application/sdp\r\n'));
        }
      } else if (state === 'describe_auth') {
        if (resp.indexOf('200 OK') > -1) {
          // Extract SPS/PPS from SDP
          var spropMatch = resp.match(/sprop-parameter-sets=([A-Za-z0-9+/=]+),([A-Za-z0-9+/=]+)/);
          if (spropMatch) {
            var spsRaw = atob(spropMatch[1]), ppsRaw = atob(spropMatch[2]);
            self._spsData = new Uint8Array(spsRaw.length);
            for (var si = 0; si < spsRaw.length; si++) self._spsData[si] = spsRaw.charCodeAt(si);
            self._ppsData = new Uint8Array(ppsRaw.length);
            for (var pi = 0; pi < ppsRaw.length; pi++) self._ppsData[pi] = ppsRaw.charCodeAt(pi);
          }
          var tm = resp.match(/a=control:(rtsp:\/\/[^\s]+trackID=1)/);
          var trackUri = tm ? tm[1] : rtspUri + 'trackID=1';
          state = 'setup'; self.onStatus('Setting up...');
          postRtsp(rtspMsg('SETUP', trackUri, digestAuth(self.user, self.pass, realm, nonce, 'SETUP', trackUri) + '\r\nTransport: RTP/AVP/TCP;unicast;interleaved=0-1\r\n'));
        }
      } else if (state === 'setup') {
        var sm = resp.match(/Session:\s*(\S+)/);
        if (sm) { sessionId = sm[1].split(';')[0].trim(); state = 'play'; self.onStatus('Starting...');
          postRtsp(rtspMsg('PLAY', rtspUri, digestAuth(self.user, self.pass, realm, nonce, 'PLAY', rtspUri) + '\r\nSession: ' + sessionId + '\r\nRange: npt=0.000-\r\n'));
          self._teardown = function() {
            postRtsp(rtspMsg('TEARDOWN', rtspUri, digestAuth(self.user, self.pass, realm, nonce, 'TEARDOWN', rtspUri) + '\r\nSession: ' + sessionId + '\r\n'));
          };
        }
      } else if (state === 'play') {
        if (resp.indexOf('200 OK') > -1) { state = 'streaming'; self.onStatus(''); }
      }
    }

    function feedNal(nalData) {
      if (!self._decoder) return;
      // Feed every NAL directly to OpenH264 with start code prefix
      var buf = new Uint8Array(4 + nalData.length);
      buf[3] = 1;
      buf.set(nalData, 4);
      self._decoder.decode(buf);
    }

    function processRtp(data) {
      if (data.length < 12) return;
      var cc = data[0] & 0x0F, hLen = 12 + cc * 4;
      if (data[0] & 0x10) { if (data.length < hLen + 4) return; hLen += 4 + ((data[hLen+2]<<8)|data[hLen+3]) * 4; }
      if (hLen >= data.length) return;
      var p = data.subarray(hLen);
      if (p.length < 1) return;
      var nt = p[0] & 0x1F;
      if (nt >= 1 && nt <= 23) {
        feedNal(p);
      } else if (nt === 28 && p.length >= 2) {
        var fh = p[1], isS = (fh&0x80)!==0, isE = (fh&0x40)!==0;
        if (isS) {
          self._fuBuf = new Uint8Array(65536);
          self._fuBuf[0] = (p[0]&0x60)|(fh&0x1F);
          self._fuBuf.set(p.subarray(2), 1); self._fuLen = 1 + p.length - 2;
        } else if (self._fuBuf) {
          if (self._fuLen + p.length - 2 > self._fuBuf.length) {
            var nb = new Uint8Array(self._fuBuf.length * 2);
            nb.set(self._fuBuf.subarray(0, self._fuLen)); self._fuBuf = nb;
          }
          self._fuBuf.set(p.subarray(2), self._fuLen); self._fuLen += p.length - 2;
          if (isE) { feedNal(self._fuBuf.subarray(0, self._fuLen)); self._fuBuf = null; }
        }
      } else if (nt === 24) {
        var off = 1;
        while (off + 2 < p.length) {
          var sz = (p[off]<<8)|p[off+1]; off += 2;
          if (off + sz > p.length) break;
          feedNal(p.subarray(off, off + sz)); off += sz;
        }
      }
    }
  };

  return RTSPStream;
})();
