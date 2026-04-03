var App = {
  VERSION: '1.0.1',
  user: null,
  pass: null,
  streaming: false,
  streamTimer: null,
  frameCount: 0,
  fpsTimer: null,
  lastFpsTime: 0,
  _prevBlob: null,
  _currentCh: 101,

  // stored XML for each config section
  _netXml: null,
  _portsXml: null,
  _vidXml: {},
  _imgColorXml: null,
  _imgSharpXml: null,
  _imgWdrXml: null,
  _imgIRXml: null,
  _imgISPXml: null,
  _imgFlipXml: null,
  _osdXml: null,
  _audioXml: null,
  _motionXml: null,
  _emailXml: null,
  _ftpXml: null,
  _ddnsXml: null,
  _timeXml: null,
  _ntpXml: null,
  _devChXml: null,
  _devInfoXml: null,

  // --- API ---
  apiUrl: function(path) {
    return location.protocol + '//' + this.user + ':' + encodeURIComponent(this.pass) + '@' + location.host + path;
  },

  apiGet: function(path, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', this.apiUrl(path), true);
    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        cb(null, xhr.responseText, xhr);
      } else {
        cb(xhr.status, null, xhr);
      }
    };
    xhr.onerror = function() { cb('network', null, xhr); };
    xhr.send();
  },

  apiPut: function(path, body, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('PUT', this.apiUrl(path), true);
    if (typeof body === 'string') {
      xhr.setRequestHeader('Content-Type', 'application/xml');
    }
    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        cb(null, xhr.responseText, xhr);
      } else {
        cb(xhr.status, null, xhr);
      }
    };
    xhr.onerror = function() { cb('network', null, xhr); };
    xhr.send(body);
  },

  xmlVal: function(xml, tag) {
    var m = xml.match(new RegExp('<' + tag + '[^>]*>([^<]*)</' + tag + '>'));
    return m ? m[1] : '';
  },

  xmlSet: function(xml, tag, val) {
    return xml.replace(new RegExp('(<' + tag + '[^>]*>)[^<]*(</' + tag + '>)'), '$1' + val + '$2');
  },

  // --- Toast ---
  toast: function(msg, type) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast ' + (type || '');
    el.classList.remove('hidden');
    clearTimeout(el._t);
    el._t = setTimeout(function() { el.classList.add('hidden'); }, 3000);
  },

  // --- Slider display helper ---
  updateSlider: function(id) {
    var el = document.getElementById(id);
    var valEl = document.getElementById(id + '-val');
    if (el && valEl) valEl.textContent = el.value;
  },

  bindSlider: function(id) {
    var self = this;
    var el = document.getElementById(id);
    if (el) {
      el.oninput = function() { self.updateSlider(id); };
    }
  },

  // --- Auth ---
  login: function(user, pass) {
    var self = this;
    self.user = user;
    self.pass = pass;
    self.apiGet('/ISAPI/Security/userCheck?timeStamp=' + Date.now(), function(err) {
      if (err) {
        self.user = null;
        self.pass = null;
        document.getElementById('login-error').textContent = err === 401 ? 'Incorrect username or password.' : 'Connection failed.';
        return;
      }
      sessionStorage.setItem('auth', btoa(user + ':' + pass));
      document.getElementById('login-page').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      self.loadDeviceInfo();
      self.navigate('live');
    });
  },

  logout: function() {
    this.stopStream();
    sessionStorage.removeItem('auth');
    this.user = null;
    this.pass = null;
    document.getElementById('app').classList.add('hidden');
    document.getElementById('login-page').classList.remove('hidden');
    document.getElementById('login-user').value = '';
    document.getElementById('login-pass').value = '';
    document.getElementById('login-error').textContent = '';
  },

  loadDeviceInfo: function() {
    var self = this;
    self.apiGet('/ISAPI/System/deviceInfo', function(err, xml) {
      if (err) return;
      var name = self.xmlVal(xml, 'deviceName') || 'IP Camera';
      var model = self.xmlVal(xml, 'model');
      document.getElementById('cam-name').textContent = name;
      document.title = name;
      document.getElementById('login-model').textContent = model;
      document.getElementById('login-version').textContent = 'v' + self.VERSION;
    });
  },

  // --- Navigation ---
  navigate: function(page) {
    var pages = document.querySelectorAll('.page-content');
    for (var i = 0; i < pages.length; i++) pages[i].classList.add('hidden');
    document.getElementById('page-' + page).classList.remove('hidden');

    var tabs = document.querySelectorAll('.nav-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('active', tabs[i].getAttribute('data-page') === page);
    }

    if (page === 'live') this.initLive();
    else if (page === 'config') this.initConfig('network');
    else if (page === 'system') this.initSystem();

    if (page !== 'live') this.stopStream();
  },

  // --- Live View ---
  initLive: function() {},

  toggleStream: function() {
    if (this.streaming) this.stopStream();
    else this.startStream();
  },

  startStream: function() {
    var self = this;
    var ch = document.getElementById('sel-stream').value;
    var mode = document.getElementById('sel-mode').value;
    var img = document.getElementById('live-img');
    var canvas = document.getElementById('live-canvas');
    var msg = document.getElementById('live-msg');
    self.streaming = true;
    document.getElementById('btn-stream-toggle').textContent = 'Stop';
    msg.textContent = 'Connecting...';

    if (mode === 'h264' && typeof RTSPStream !== 'undefined') {
      img.style.display = 'none';
      canvas.style.display = 'block';
      self._rtspStream = new RTSPStream({
        host: location.host,
        user: self.user,
        pass: self.pass,
        channel: ch,
        canvas: canvas,
        onStatus: function(s) { if (s) msg.textContent = s; else msg.style.display = 'none'; },
        onError: function(e) { msg.style.display = ''; msg.textContent = e; },
        onFps: function(fps) { document.getElementById('live-fps').textContent = fps ? fps + ' fps' : ''; }
      });
      self._rtspStream.start();
    } else {
      canvas.style.display = 'none';
      self.frameCount = 0;
      self.lastFpsTime = Date.now();
      self._prevBlob = null;

      var fetchFrame = function() {
        if (!self.streaming) return;
        var xhr = new XMLHttpRequest();
        xhr.open('GET', self.apiUrl('/ISAPI/Streaming/channels/' + ch + '/picture?_=' + Date.now()), true);
        xhr.responseType = 'blob';
        xhr.onload = function() {
          if (!self.streaming) return;
          if (xhr.status >= 200 && xhr.status < 300) {
            if (self._prevBlob) URL.revokeObjectURL(self._prevBlob);
            var url = URL.createObjectURL(xhr.response);
            self._prevBlob = url;
            img.src = url;
            img.style.display = 'block';
            msg.style.display = 'none';
            self.frameCount++;
            self.streamTimer = setTimeout(fetchFrame, 100);
          } else {
            self.streamTimer = setTimeout(fetchFrame, 1000);
          }
        };
        xhr.onerror = function() {
          if (self.streaming) self.streamTimer = setTimeout(fetchFrame, 1000);
        };
        xhr.send();
      };

      self.fpsTimer = setInterval(function() {
        var now = Date.now();
        var elapsed = (now - self.lastFpsTime) / 1000;
        var fps = elapsed > 0 ? (self.frameCount / elapsed).toFixed(1) : '0';
        document.getElementById('live-fps').textContent = fps + ' fps';
        self.frameCount = 0;
        self.lastFpsTime = now;
      }, 2000);

      fetchFrame();
    }
  },

  stopStream: function() {
    this.streaming = false;
    if (this._rtspStream) { this._rtspStream.stop(); this._rtspStream = null; }
    clearTimeout(this.streamTimer);
    clearInterval(this.fpsTimer);
    this.streamTimer = null;
    var img = document.getElementById('live-img');
    if (img) { img.style.display = 'none'; img.src = ''; }
    var canvas = document.getElementById('live-canvas');
    if (canvas) canvas.style.display = 'none';
    if (this._prevBlob) { URL.revokeObjectURL(this._prevBlob); this._prevBlob = null; }
    var msg = document.getElementById('live-msg');
    if (msg) { msg.style.display = ''; msg.textContent = 'Click Start to begin live view'; }
    var btn = document.getElementById('btn-stream-toggle');
    if (btn) btn.textContent = 'Start';
    var fps = document.getElementById('live-fps');
    if (fps) fps.textContent = '';
  },

  capture: function() {
    var canvas = document.getElementById('live-canvas');
    var img = document.getElementById('live-img');
    var src;
    if (canvas && canvas.style.display !== 'none' && canvas.width > 0) {
      src = canvas;
    } else if (img && img.src && img.style.display !== 'none') {
      src = img;
    } else {
      return;
    }
    var c = document.createElement('canvas');
    c.width = src.naturalWidth || src.width;
    c.height = src.naturalHeight || src.height;
    c.getContext('2d').drawImage(src, 0, 0);
    var a = document.createElement('a');
    a.href = c.toDataURL('image/jpeg', 0.95);
    a.download = 'capture_' + new Date().toISOString().replace(/[:.]/g, '-') + '.jpg';
    a.click();
    this.toast('Captured', 'ok');
  },

  fullscreen: function() {
    var el = document.querySelector('.live-video');
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  },

  // --- Config ---
  initConfig: function(section) {
    var sections = document.querySelectorAll('.cfg-section');
    for (var i = 0; i < sections.length; i++) sections[i].classList.add('hidden');
    var tabs = document.querySelectorAll('.config-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('active', tabs[i].getAttribute('data-cfg') === section);
    }
    document.getElementById('cfg-loading').classList.remove('hidden');

    if (section === 'network') this.loadNetwork();
    else if (section === 'wifi') this.loadWifi();
    else if (section === 'ports') this.loadPorts();
    else if (section === 'video') this.loadVideoStream(101);
    else if (section === 'image') this.loadImage();
    else if (section === 'osd') this.loadOsd();
    else if (section === 'audio') this.loadAudio();
    else if (section === 'motion') this.loadMotion();
    else if (section === 'pir') this.loadPir();
    else if (section === 'email') this.loadEmail();
    else if (section === 'ftp') this.loadFtp();
    else if (section === 'ddns') this.loadDdns();
    else if (section === 'time') this.loadTime();
    else if (section === 'users') this.loadUsers();
    else if (section === 'devname') this.loadDevName();
  },

  showCfg: function(id) {
    document.getElementById('cfg-loading').classList.add('hidden');
    document.getElementById(id).classList.remove('hidden');
  },

  // --- Network ---
  loadNetwork: function() {
    var self = this;
    self.apiGet('/ISAPI/System/Network/interfaces/1', function(err, xml) {
      if (err) return self.toast('Failed to load network config', 'err');
      self._netXml = xml;
      document.getElementById('net-addressing').value = self.xmlVal(xml, 'addressingType');
      document.getElementById('net-ip').value = self.xmlVal(xml, 'ipAddress') || '';
      document.getElementById('net-mask').value = self.xmlVal(xml, 'subnetMask') || '';
      var gw = xml.match(/<DefaultGateway>[\s\S]*?<ipAddress>([^<]*)/);
      document.getElementById('net-gw').value = gw ? gw[1] : '';
      var dns1 = xml.match(/<PrimaryDNS>[\s\S]*?<ipAddress>([^<]*)/);
      document.getElementById('net-dns1').value = dns1 ? dns1[1] : '';
      var dns2 = xml.match(/<SecondaryDNS>[\s\S]*?<ipAddress>([^<]*)/);
      document.getElementById('net-dns2').value = dns2 ? dns2[1] : '';
      self.apiGet('/ISAPI/System/deviceInfo', function(err2, xml2) {
        document.getElementById('net-mac').value = self.xmlVal(xml2 || '', 'macAddress');
      });
      self.showCfg('cfg-network');
    });
  },

  saveNetwork: function() {
    var self = this;
    var xml = self._netXml;
    if (!xml) return;
    xml = self.xmlSet(xml, 'addressingType', document.getElementById('net-addressing').value);
    xml = xml.replace(/(<IPAddress[^>]*>[\s\S]*?<ipAddress>)[^<]*/, '$1' + document.getElementById('net-ip').value);
    xml = self.xmlSet(xml, 'subnetMask', document.getElementById('net-mask').value);
    xml = xml.replace(/(<DefaultGateway>[\s\S]*?<ipAddress>)[^<]*/, '$1' + document.getElementById('net-gw').value);
    xml = xml.replace(/(<PrimaryDNS>[\s\S]*?<ipAddress>)[^<]*/, '$1' + document.getElementById('net-dns1').value);
    xml = xml.replace(/(<SecondaryDNS>[\s\S]*?<ipAddress>)[^<]*/, '$1' + document.getElementById('net-dns2').value);
    self.apiPut('/ISAPI/System/Network/interfaces/1', xml, function(err) {
      if (err) return self.toast('Failed to save network config', 'err');
      self.toast('Network config saved. Camera may reboot.', 'ok');
    });
  },

  // --- WiFi ---
  loadWifi: function() {
    document.getElementById('wifi-list').innerHTML = '';
    document.getElementById('wifi-status').textContent = '';
    document.getElementById('wifi-connect-box').classList.add('hidden');
    this.showCfg('cfg-wifi');
  },

  wifiScan: function() {
    var self = this;
    document.getElementById('wifi-status').textContent = 'Scanning...';
    document.getElementById('wifi-list').innerHTML = '';
    self.apiGet('/ISAPI/System/Network/interfaces/1/wireless/accessPointList', function(err, xml) {
      if (err) {
        document.getElementById('wifi-status').textContent = 'Scan failed';
        return self.toast('WiFi scan failed', 'err');
      }
      document.getElementById('wifi-status').textContent = '';
      var rows = '';
      var aps = xml.match(/<accessPoint[^>]*>[\s\S]*?<\/accessPoint>/g) || [];
      for (var i = 0; i < aps.length; i++) {
        var ap = aps[i];
        var ssid = self.xmlVal(ap, 'ssid');
        var signal = parseInt(self.xmlVal(ap, 'signalStrength')) || 0;
        var sec = self.xmlVal(ap, 'securityMode') || 'open';
        var conn = self.xmlVal(ap, 'connected');
        var isConn = conn === 'true';
        var pct = Math.min(signal, 100);
        var barColor = pct > 60 ? 'var(--success)' : pct > 30 ? '#eab308' : 'var(--warn)';
        rows += '<tr>';
        rows += '<td>' + self.esc(ssid) + '</td>';
        rows += '<td><span class="signal-bar"><span class="signal-fill" style="width:' + pct + '%;background:' + barColor + '"></span></span>' + signal + '%</td>';
        rows += '<td>' + self.esc(sec) + '</td>';
        rows += '<td>' + (isConn ? '<span class="connected">Connected</span>' : '') + '</td>';
        rows += '<td>' + (isConn ? '' : '<button class="btn btn-sm wifi-connect-btn" data-ssid="' + self.esc(ssid).replace(/"/g, '&quot;') + '" data-sec="' + self.esc(sec).replace(/"/g, '&quot;') + '">Connect</button>') + '</td>';
        rows += '</tr>';
      }
      if (aps.length === 0) {
        rows = '<tr><td colspan="5" style="color:var(--fg3)">No networks found</td></tr>';
      }
      document.getElementById('wifi-list').innerHTML = rows;
      var btns = document.querySelectorAll('.wifi-connect-btn');
      for (var j = 0; j < btns.length; j++) {
        btns[j].onclick = function() {
          self.wifiPromptConnect(this.getAttribute('data-ssid'), this.getAttribute('data-sec'));
        };
      }
    });
  },

  esc: function(s) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(s));
    return d.innerHTML;
  },

  wifiPromptConnect: function(ssid, sec) {
    document.getElementById('wifi-connect-ssid').textContent = ssid;
    document.getElementById('wifi-connect-ssid-val').value = ssid;
    document.getElementById('wifi-connect-sec-val').value = sec;
    document.getElementById('wifi-connect-key').value = '';
    document.getElementById('wifi-connect-box').classList.remove('hidden');
  },

  wifiCancelConnect: function() {
    document.getElementById('wifi-connect-box').classList.add('hidden');
  },

  wifiDoConnect: function() {
    var self = this;
    var ssid = document.getElementById('wifi-connect-ssid-val').value;
    var sec = document.getElementById('wifi-connect-sec-val').value;
    var key = document.getElementById('wifi-connect-key').value;
    if (!key) return self.toast('Enter a password', 'err');

    var xml = '<?xml version="1.0" encoding="UTF-8"?>';
    xml += '<WirelessNetworkSetting xmlns="http://www.hikvision.com/ver20/XMLSchema">';
    xml += '<wirelessNetworkMode>infrastructure</wirelessNetworkMode>';
    xml += '<ssid>' + ssid + '</ssid>';
    xml += '<securityMode>' + sec + '</securityMode>';
    xml += '<WPA><algorithmType>TKIP/AES</algorithmType><sharedKey>' + key + '</sharedKey></WPA>';
    xml += '</WirelessNetworkSetting>';

    self.apiPut('/ISAPI/System/Network/interfaces/1/wireless', xml, function(err) {
      if (err) return self.toast('Failed to connect to ' + ssid, 'err');
      self.toast('Connecting to ' + ssid + '...', 'ok');
      document.getElementById('wifi-connect-box').classList.add('hidden');
    });
  },

  // --- Ports ---
  loadPorts: function() {
    var self = this;
    self.apiGet('/ISAPI/Security/adminAccesses', function(err, xml) {
      if (err) return self.toast('Failed to load ports', 'err');
      self._portsXml = xml;
      var protos = xml.match(/<AdminAccessProtocol[^>]*>[\s\S]*?<\/AdminAccessProtocol>/g) || [];
      for (var i = 0; i < protos.length; i++) {
        var proto = self.xmlVal(protos[i], 'protocol');
        var port = self.xmlVal(protos[i], 'portNo');
        if (proto === 'HTTP') document.getElementById('port-http').value = port;
        else if (proto === 'HTTPS') document.getElementById('port-https').value = port;
        else if (proto === 'RTSP') document.getElementById('port-rtsp').value = port;
        else if (proto === 'DEV_MANAGE') document.getElementById('port-sdk').value = port;
      }
      self.showCfg('cfg-ports');
    });
  },

  savePorts: function() {
    var self = this;
    var xml = self._portsXml;
    if (!xml) return;
    var map = {
      'HTTP': document.getElementById('port-http').value,
      'HTTPS': document.getElementById('port-https').value,
      'RTSP': document.getElementById('port-rtsp').value,
      'DEV_MANAGE': document.getElementById('port-sdk').value
    };
    for (var proto in map) {
      if (map.hasOwnProperty(proto)) {
        var re = new RegExp('(<AdminAccessProtocol[^>]*>[\\s\\S]*?<protocol>' + proto + '</protocol>[\\s\\S]*?<portNo>)[^<]*(</portNo>)');
        xml = xml.replace(re, '$1' + map[proto] + '$2');
      }
    }
    self.apiPut('/ISAPI/Security/adminAccesses', xml, function(err) {
      if (err) return self.toast('Failed to save ports', 'err');
      self.toast('Ports saved', 'ok');
    });
  },

  // --- Video ---
  loadVideoStream: function(ch) {
    var self = this;
    self._currentCh = ch;
    // update stream tab buttons
    var btns = document.querySelectorAll('.stream-tab');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-ch') === String(ch));
    }

    // if already cached, show it
    if (self._vidXml[ch]) {
      self.populateVideoForm(ch);
      self.showCfg('cfg-video');
      return;
    }

    self.apiGet('/ISAPI/Streaming/channels/' + ch, function(err, xml) {
      if (err) {
        self.toast('Failed to load stream ' + ch, 'err');
        self.showCfg('cfg-video');
        return;
      }
      self._vidXml[ch] = xml;
      self.populateVideoForm(ch);
      self.showCfg('cfg-video');
    });
  },

  populateVideoForm: function(ch) {
    var self = this;
    var xml = self._vidXml[ch];
    if (!xml) return;
    var w = self.xmlVal(xml, 'videoResolutionWidth');
    var h = self.xmlVal(xml, 'videoResolutionHeight');
    document.getElementById('vid-res').textContent = w + 'x' + h;
    document.getElementById('vid-codec').value = self.xmlVal(xml, 'videoCodecType');
    document.getElementById('vid-qtype').value = self.xmlVal(xml, 'videoQualityControlType');
    var bitrate = self.xmlVal(xml, 'vbrUpperCap') || self.xmlVal(xml, 'constantBitRate');
    document.getElementById('vid-bitrate').value = bitrate;
    var fps = parseInt(self.xmlVal(xml, 'maxFrameRate')) || 2500;
    document.getElementById('vid-fps').value = Math.round(fps / 100);
    document.getElementById('vid-profile').value = self.xmlVal(xml, 'H264Profile') || 'main';
  },

  saveVideo: function() {
    var self = this;
    var ch = self._currentCh;
    var xml = self._vidXml[ch];
    if (!xml) return;
    xml = self.xmlSet(xml, 'videoCodecType', document.getElementById('vid-codec').value);
    xml = self.xmlSet(xml, 'videoQualityControlType', document.getElementById('vid-qtype').value);
    var bitrate = document.getElementById('vid-bitrate').value;
    xml = self.xmlSet(xml, 'vbrUpperCap', bitrate);
    xml = self.xmlSet(xml, 'constantBitRate', bitrate);
    xml = self.xmlSet(xml, 'maxFrameRate', parseInt(document.getElementById('vid-fps').value) * 100);
    xml = self.xmlSet(xml, 'H264Profile', document.getElementById('vid-profile').value);
    self.apiPut('/ISAPI/Streaming/channels/' + ch, xml, function(err) {
      if (err) return self.toast('Failed to save stream ' + ch, 'err');
      self._vidXml[ch] = null; // invalidate cache
      self.toast('Stream ' + ch + ' saved', 'ok');
    });
  },

  // --- Image ---
  loadImage: function() {
    var self = this;
    var loaded = 0;
    var total = 6;
    var done = function() { if (++loaded >= total) self.showCfg('cfg-image'); };

    self.apiGet('/ISAPI/Image/channels/1/color', function(err, xml) {
      if (!err) {
        self._imgColorXml = xml;
        var br = self.xmlVal(xml, 'brightnessLevel') || '50';
        var co = self.xmlVal(xml, 'contrastLevel') || '50';
        var sa = self.xmlVal(xml, 'saturationLevel') || '50';
        document.getElementById('img-brightness').value = br;
        document.getElementById('img-brightness-val').textContent = br;
        document.getElementById('img-contrast').value = co;
        document.getElementById('img-contrast-val').textContent = co;
        document.getElementById('img-saturation').value = sa;
        document.getElementById('img-saturation-val').textContent = sa;
      }
      done();
    });

    self.apiGet('/ISAPI/Image/channels/1/sharpness', function(err, xml) {
      if (!err) {
        self._imgSharpXml = xml;
        var v = self.xmlVal(xml, 'SharpnessLevel') || '50';
        document.getElementById('img-sharpness').value = v;
        document.getElementById('img-sharpness-val').textContent = v;
      }
      done();
    });

    self.apiGet('/ISAPI/Image/channels/1/WDR', function(err, xml) {
      if (!err) {
        self._imgWdrXml = xml;
        document.getElementById('img-wdr-mode').value = self.xmlVal(xml, 'mode') || 'close';
        var lv = self.xmlVal(xml, 'WDRLevel') || '50';
        document.getElementById('img-wdr-level').value = lv;
        document.getElementById('img-wdr-level-val').textContent = lv;
      }
      done();
    });

    self.apiGet('/ISAPI/Image/channels/1/irCutFilter', function(err, xml) {
      if (!err) {
        self._imgIRXml = xml;
        document.getElementById('img-ircut').value = self.xmlVal(xml, 'IrcutFilterType') || 'auto';
      }
      done();
    });

    self.apiGet('/ISAPI/Image/channels/1/ISPMode', function(err, xml) {
      if (!err) {
        self._imgISPXml = xml;
        document.getElementById('img-isp-mode').value = self.xmlVal(xml, 'mode') || 'auto';
      }
      done();
    });

    self.apiGet('/ISAPI/Image/channels/1/imageFlip', function(err, xml) {
      if (!err) {
        self._imgFlipXml = xml;
        document.getElementById('img-flip').value = self.xmlVal(xml, 'enabled') || 'false';
      }
      done();
    });
  },

  saveImageColor: function() {
    var self = this;
    var xml = self._imgColorXml;
    if (!xml) return;
    xml = self.xmlSet(xml, 'brightnessLevel', document.getElementById('img-brightness').value);
    xml = self.xmlSet(xml, 'contrastLevel', document.getElementById('img-contrast').value);
    xml = self.xmlSet(xml, 'saturationLevel', document.getElementById('img-saturation').value);
    self.apiPut('/ISAPI/Image/channels/1/color', xml, function(err) {
      if (err) return self.toast('Failed to save color settings', 'err');
      self.toast('Color settings saved', 'ok');
    });

    // save sharpness in parallel
    var sxml = self._imgSharpXml;
    if (sxml) {
      sxml = self.xmlSet(sxml, 'SharpnessLevel', document.getElementById('img-sharpness').value);
      self.apiPut('/ISAPI/Image/channels/1/sharpness', sxml, function(err) {
        if (err) self.toast('Failed to save sharpness', 'err');
      });
    }
  },

  saveWdr: function() {
    var self = this;
    var xml = self._imgWdrXml;
    if (!xml) return;
    xml = self.xmlSet(xml, 'mode', document.getElementById('img-wdr-mode').value);
    xml = self.xmlSet(xml, 'WDRLevel', document.getElementById('img-wdr-level').value);
    self.apiPut('/ISAPI/Image/channels/1/WDR', xml, function(err) {
      if (err) return self.toast('Failed to save WDR', 'err');
      self.toast('WDR saved', 'ok');
    });
  },

  saveIRCut: function() {
    var self = this;
    var xml = self._imgIRXml;
    if (!xml) return;
    xml = self.xmlSet(xml, 'IrcutFilterType', document.getElementById('img-ircut').value);
    self.apiPut('/ISAPI/Image/channels/1/irCutFilter', xml, function(err) {
      if (err) return self.toast('Failed to save IR cut filter', 'err');
      self.toast('IR cut filter saved', 'ok');
    });
  },

  saveISPMode: function() {
    var self = this;
    var xml = self._imgISPXml;
    if (!xml) return;
    xml = self.xmlSet(xml, 'mode', document.getElementById('img-isp-mode').value);
    self.apiPut('/ISAPI/Image/channels/1/ISPMode', xml, function(err) {
      if (err) return self.toast('Failed to save ISP mode', 'err');
      self.toast('ISP mode saved', 'ok');
    });
  },

  saveFlip: function() {
    var self = this;
    var xml = self._imgFlipXml;
    if (!xml) return;
    xml = self.xmlSet(xml, 'enabled', document.getElementById('img-flip').value);
    self.apiPut('/ISAPI/Image/channels/1/imageFlip', xml, function(err) {
      if (err) return self.toast('Failed to save flip', 'err');
      self.toast('Flip saved', 'ok');
    });
  },

  // --- OSD ---
  loadOsd: function() {
    var self = this;
    self.apiGet('/ISAPI/System/Video/inputs/channels/1/overlays', function(err, xml) {
      if (err) return self.toast('Failed to load OSD', 'err');
      self._osdXml = xml;

      // date/time overlay enabled
      var dtBlock = xml.match(/<DateTimeOverlay>[\s\S]*?<\/DateTimeOverlay>/);
      if (dtBlock) {
        document.getElementById('osd-dt-enabled').value = self.xmlVal(dtBlock[0], 'enabled') || 'false';
        document.getElementById('osd-date-style').value = self.xmlVal(dtBlock[0], 'dateStyle') || 'YYYY-MM-DD';
        document.getElementById('osd-week').value = self.xmlVal(dtBlock[0], 'displayWeek') || 'false';
      }

      // channel name overlay
      var chBlock = xml.match(/<channelNameOverlay>[\s\S]*?<\/channelNameOverlay>/);
      if (chBlock) {
        document.getElementById('osd-ch-enabled').value = self.xmlVal(chBlock[0], 'enabled') || 'false';
      }

      self.showCfg('cfg-osd');
    });
  },

  saveOsd: function() {
    var self = this;
    var xml = self._osdXml;
    if (!xml) return;

    // date/time overlay
    xml = xml.replace(/(<DateTimeOverlay>[\s\S]*?<enabled>)[^<]*(<\/enabled>)/, '$1' + document.getElementById('osd-dt-enabled').value + '$2');
    xml = xml.replace(/(<DateTimeOverlay>[\s\S]*?<dateStyle>)[^<]*(<\/dateStyle>)/, '$1' + document.getElementById('osd-date-style').value + '$2');
    xml = xml.replace(/(<DateTimeOverlay>[\s\S]*?<displayWeek>)[^<]*(<\/displayWeek>)/, '$1' + document.getElementById('osd-week').value + '$2');

    // channel name overlay
    xml = xml.replace(/(<channelNameOverlay>[\s\S]*?<enabled>)[^<]*(<\/enabled>)/, '$1' + document.getElementById('osd-ch-enabled').value + '$2');

    self.apiPut('/ISAPI/System/Video/inputs/channels/1/overlays', xml, function(err) {
      if (err) return self.toast('Failed to save OSD', 'err');
      self.toast('OSD saved', 'ok');
    });
  },

  // --- Audio ---
  loadAudio: function() {
    var self = this;
    self.apiGet('/ISAPI/System/Audio/channels/1', function(err, xml) {
      if (err) return self.toast('Failed to load audio', 'err');
      self._audioXml = xml;
      document.getElementById('audio-enabled').value = self.xmlVal(xml, 'enabled') || 'false';
      self.showCfg('cfg-audio');
    });
  },

  saveAudio: function() {
    var self = this;
    var xml = self._audioXml;
    if (!xml) return;
    xml = self.xmlSet(xml, 'enabled', document.getElementById('audio-enabled').value);
    self.apiPut('/ISAPI/System/Audio/channels/1', xml, function(err) {
      if (err) return self.toast('Failed to save audio', 'err');
      self.toast('Audio saved', 'ok');
    });
  },

  // --- Motion Detection ---
  loadMotion: function() {
    var self = this;
    self.apiGet('/ISAPI/System/Video/inputs/channels/1/motionDetection', function(err, xml) {
      if (err) return self.toast('Failed to load motion detection', 'err');
      self._motionXml = xml;
      document.getElementById('md-enabled').value = self.xmlVal(xml, 'enabled') || 'false';
      var sens = self.xmlVal(xml, 'sensitivityLevel') || '50';
      document.getElementById('md-sensitivity').value = sens;
      document.getElementById('md-sensitivity-val').textContent = sens;
      self.showCfg('cfg-motion');
    });
  },

  saveMotion: function() {
    var self = this;
    var xml = self._motionXml;
    if (!xml) return;
    xml = self.xmlSet(xml, 'enabled', document.getElementById('md-enabled').value);
    xml = self.xmlSet(xml, 'sensitivityLevel', document.getElementById('md-sensitivity').value);
    self.apiPut('/ISAPI/System/Video/inputs/channels/1/motionDetection', xml, function(err) {
      if (err) return self.toast('Failed to save motion detection', 'err');
      self.toast('Motion detection saved', 'ok');
    });
  },

  // --- PIR ---
  loadPir: function() {
    var self = this;
    self.apiGet('/ISAPI/Event/triggers/PIR-1', function(err, xml) {
      if (err) {
        document.getElementById('pir-info').textContent = 'PIR not available or failed to load.';
        self.showCfg('cfg-pir');
        return;
      }
      var lines = [];
      var enabled = self.xmlVal(xml, 'enabled');
      lines.push('Enabled: ' + (enabled || 'N/A'));

      // parse notification methods
      var methods = xml.match(/<EventTriggerNotificationList>[\s\S]*?<\/EventTriggerNotificationList>/);
      if (methods) {
        var notifs = methods[0].match(/<EventTriggerNotification>[\s\S]*?<\/EventTriggerNotification>/g) || [];
        for (var i = 0; i < notifs.length; i++) {
          var ntype = self.xmlVal(notifs[i], 'notificationMethod');
          var nrecv = self.xmlVal(notifs[i], 'notificationRecurrence');
          if (ntype) lines.push('Method: ' + ntype + (nrecv ? ' (' + nrecv + ')' : ''));
        }
      }

      document.getElementById('pir-info').innerHTML = lines.join('<br>');
      self.showCfg('cfg-pir');
    });
  },

  // --- Email ---
  loadEmail: function() {
    var self = this;
    self.apiGet('/ISAPI/System/Network/mailing', function(err, xml) {
      if (err) return self.toast('Failed to load email config', 'err');
      self._emailXml = xml;

      // sender
      var senderBlock = xml.match(/<sender>[\s\S]*?<\/sender>/);
      if (senderBlock) {
        document.getElementById('em-sender').value = self.xmlVal(senderBlock[0], 'emailAddress') || '';
      }

      // smtp
      document.getElementById('em-host').value = self.xmlVal(xml, 'hostName') || '';
      document.getElementById('em-port').value = self.xmlVal(xml, 'portNo') || '';
      document.getElementById('em-ssl').value = self.xmlVal(xml, 'enableSSL') || 'false';
      document.getElementById('em-auth').value = self.xmlVal(xml, 'enableAuthorization') || 'false';
      document.getElementById('em-account').value = self.xmlVal(xml, 'accountName') || '';

      // receivers
      var recvBlocks = xml.match(/<receiver>[\s\S]*?<\/receiver>/g) || [];
      for (var i = 0; i < 3; i++) {
        var addr = '';
        if (recvBlocks[i]) addr = self.xmlVal(recvBlocks[i], 'emailAddress') || '';
        document.getElementById('em-recv' + (i + 1)).value = addr;
      }

      // attachment snapshot
      var snapMatch = xml.match(/<attachment>[\s\S]*?<snapshot>[\s\S]*?<enabled>([^<]*)/);
      document.getElementById('em-snapshot').value = snapMatch ? snapMatch[1] : 'false';

      self.showCfg('cfg-email');
    });
  },

  saveEmail: function() {
    var self = this;
    var xml = self._emailXml;
    if (!xml) return;

    // sender email
    xml = xml.replace(/(<sender>[\s\S]*?<emailAddress>)[^<]*(<\/emailAddress>)/, '$1' + document.getElementById('em-sender').value + '$2');

    // smtp
    xml = self.xmlSet(xml, 'hostName', document.getElementById('em-host').value);
    xml = self.xmlSet(xml, 'portNo', document.getElementById('em-port').value);
    xml = self.xmlSet(xml, 'enableSSL', document.getElementById('em-ssl').value);
    xml = self.xmlSet(xml, 'enableAuthorization', document.getElementById('em-auth').value);
    xml = self.xmlSet(xml, 'accountName', document.getElementById('em-account').value);

    // receivers - replace each one in order
    var recvIdx = 0;
    xml = xml.replace(/<receiver>[\s\S]*?<\/receiver>/g, function(block) {
      recvIdx++;
      var addr = '';
      if (recvIdx <= 3) addr = document.getElementById('em-recv' + recvIdx).value;
      return block.replace(/(<emailAddress>)[^<]*(<\/emailAddress>)/, '$1' + addr + '$2');
    });

    // snapshot attachment
    xml = xml.replace(/(<attachment>[\s\S]*?<snapshot>[\s\S]*?<enabled>)[^<]*(<\/enabled>)/, '$1' + document.getElementById('em-snapshot').value + '$2');

    self.apiPut('/ISAPI/System/Network/mailing', xml, function(err) {
      if (err) return self.toast('Failed to save email config', 'err');
      self.toast('Email config saved', 'ok');
    });
  },

  // --- FTP ---
  loadFtp: function() {
    var self = this;
    self.apiGet('/ISAPI/System/Network/ftp', function(err, xml) {
      if (err) return self.toast('Failed to load FTP config', 'err');
      self._ftpXml = xml;
      document.getElementById('ftp-enabled').value = self.xmlVal(xml, 'enabled') || 'false';
      document.getElementById('ftp-ip').value = self.xmlVal(xml, 'ipAddress') || '';
      document.getElementById('ftp-port').value = self.xmlVal(xml, 'portNo') || '21';
      document.getElementById('ftp-user').value = self.xmlVal(xml, 'userName') || '';
      document.getElementById('ftp-anon').value = self.xmlVal(xml, 'annoyftp') || 'false';
      self.showCfg('cfg-ftp');
    });
  },

  saveFtp: function() {
    var self = this;
    var xml = self._ftpXml;
    if (!xml) return;
    xml = self.xmlSet(xml, 'enabled', document.getElementById('ftp-enabled').value);
    xml = self.xmlSet(xml, 'ipAddress', document.getElementById('ftp-ip').value);
    xml = self.xmlSet(xml, 'portNo', document.getElementById('ftp-port').value);
    xml = self.xmlSet(xml, 'userName', document.getElementById('ftp-user').value);
    xml = self.xmlSet(xml, 'annoyftp', document.getElementById('ftp-anon').value);
    self.apiPut('/ISAPI/System/Network/ftp', xml, function(err) {
      if (err) return self.toast('Failed to save FTP config', 'err');
      self.toast('FTP config saved', 'ok');
    });
  },

  // --- DDNS ---
  loadDdns: function() {
    var self = this;
    self.apiGet('/ISAPI/System/Network/DDNS', function(err, xml) {
      if (err) return self.toast('Failed to load DDNS config', 'err');
      self._ddnsXml = xml;
      document.getElementById('ddns-enabled').value = self.xmlVal(xml, 'enabled') || 'false';
      document.getElementById('ddns-provider').value = self.xmlVal(xml, 'provider') || '';
      // server may be in hostName or serverAddress
      var srv = self.xmlVal(xml, 'hostName') || self.xmlVal(xml, 'serverAddress') || '';
      document.getElementById('ddns-server').value = srv;
      document.getElementById('ddns-domain').value = self.xmlVal(xml, 'deviceDomainName') || '';
      document.getElementById('ddns-user').value = self.xmlVal(xml, 'userName') || '';
      self.showCfg('cfg-ddns');
    });
  },

  saveDdns: function() {
    var self = this;
    var xml = self._ddnsXml;
    if (!xml) return;
    xml = self.xmlSet(xml, 'enabled', document.getElementById('ddns-enabled').value);
    xml = self.xmlSet(xml, 'provider', document.getElementById('ddns-provider').value);
    // try both hostName and serverAddress
    var srv = document.getElementById('ddns-server').value;
    xml = self.xmlSet(xml, 'hostName', srv);
    xml = self.xmlSet(xml, 'serverAddress', srv);
    xml = self.xmlSet(xml, 'deviceDomainName', document.getElementById('ddns-domain').value);
    xml = self.xmlSet(xml, 'userName', document.getElementById('ddns-user').value);
    self.apiPut('/ISAPI/System/Network/DDNS', xml, function(err) {
      if (err) return self.toast('Failed to save DDNS config', 'err');
      self.toast('DDNS config saved', 'ok');
    });
  },

  // --- Time ---
  loadTime: function() {
    var self = this;
    var loaded = 0;
    var done = function() { if (++loaded >= 2) self.showCfg('cfg-time'); };

    self.apiGet('/ISAPI/System/time', function(err, xml) {
      if (!err) {
        self._timeXml = xml;
        document.getElementById('time-mode').value = self.xmlVal(xml, 'timeMode') || 'NTP';
        document.getElementById('time-current').textContent = self.xmlVal(xml, 'localTime').replace('T', ' ');
      }
      done();
    });

    self.apiGet('/ISAPI/System/time/ntpServers/1', function(err, xml) {
      if (!err) {
        self._ntpXml = xml;
        document.getElementById('time-ntp').value = self.xmlVal(xml, 'ipAddress') || '';
        document.getElementById('time-interval').value = self.xmlVal(xml, 'synchronizeInterval') || '60';
      }
      done();
    });
  },

  saveTime: function() {
    var self = this;
    var saved = 0;
    var total = 0;
    var errs = 0;
    var checkDone = function() { if (++saved >= total) { errs ? self.toast('Failed to save time config', 'err') : self.toast('Time config saved', 'ok'); } };

    if (self._timeXml) {
      total++;
      var xml = self.xmlSet(self._timeXml, 'timeMode', document.getElementById('time-mode').value);
      self.apiPut('/ISAPI/System/time', xml, function(err) { if (err) errs++; checkDone(); });
    }
    if (self._ntpXml) {
      total++;
      var nxml = self._ntpXml;
      nxml = self.xmlSet(nxml, 'ipAddress', document.getElementById('time-ntp').value);
      nxml = self.xmlSet(nxml, 'synchronizeInterval', document.getElementById('time-interval').value);
      self.apiPut('/ISAPI/System/time/ntpServers/1', nxml, function(err) { if (err) errs++; checkDone(); });
    }
  },

  // --- Users ---
  loadUsers: function() {
    var self = this;
    document.getElementById('user-name').textContent = self.user;
    document.getElementById('user-newpass').value = '';
    document.getElementById('user-confirm').value = '';
    self.showCfg('cfg-users');
  },

  savePassword: function() {
    var self = this;
    var np = document.getElementById('user-newpass').value;
    var cp = document.getElementById('user-confirm').value;
    if (!np) return self.toast('Password cannot be empty', 'err');
    if (np !== cp) return self.toast('Passwords do not match', 'err');
    if (np.length < 8) return self.toast('Password must be at least 8 characters', 'err');

    self.apiGet('/ISAPI/Security/users', function(err, xml) {
      if (err) return self.toast('Failed to load user info', 'err');
      var uid = self.xmlVal(xml, 'id');
      var uxml = '<?xml version="1.0" encoding="UTF-8"?>';
      uxml += '<User version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">';
      uxml += '<id>' + uid + '</id>';
      uxml += '<userName>' + self.user + '</userName>';
      uxml += '<password>' + np + '</password>';
      uxml += '</User>';
      self.apiPut('/ISAPI/Security/users/' + uid, uxml, function(err2) {
        if (err2) return self.toast('Failed to change password', 'err');
        self.pass = np;
        sessionStorage.setItem('auth', btoa(self.user + ':' + np));
        self.toast('Password changed', 'ok');
      });
    });
  },

  // --- Device Name ---
  loadDevName: function() {
    var self = this;
    self.apiGet('/ISAPI/System/Video/inputs/channels/1', function(err, xml) {
      if (err) return self.toast('Failed to load device name', 'err');
      self._devChXml = xml;
      document.getElementById('devname-input').value = self.xmlVal(xml, 'name') || '';
      self.showCfg('cfg-devname');
    });
  },

  saveDevName: function() {
    var self = this;
    var name = document.getElementById('devname-input').value;
    if (!name) return self.toast('Name cannot be empty', 'err');

    var saved = 0;
    var errs = 0;
    var checkDone = function() {
      if (++saved >= 2) {
        if (errs) return self.toast('Failed to save device name', 'err');
        document.getElementById('cam-name').textContent = name;
        document.title = name;
        self.toast('Device name saved', 'ok');
      }
    };

    // update channel name
    var chXml = self._devChXml;
    if (chXml) {
      chXml = self.xmlSet(chXml, 'name', name);
      self.apiPut('/ISAPI/System/Video/inputs/channels/1', chXml, function(err) { if (err) errs++; checkDone(); });
    } else {
      saved++;
    }

    // update deviceInfo deviceName
    self.apiGet('/ISAPI/System/deviceInfo', function(err, xml) {
      if (err) { errs++; return checkDone(); }
      xml = self.xmlSet(xml, 'deviceName', name);
      self.apiPut('/ISAPI/System/deviceInfo', xml, function(err2) { if (err2) errs++; checkDone(); });
    });
  },

  // --- System ---
  initSystem: function() {
    var self = this;
    self.apiGet('/ISAPI/System/deviceInfo', function(err, xml) {
      if (err) return;
      var fields = [
        ['Device Name', 'deviceName'], ['Model', 'model'], ['Serial', 'serialNumber'],
        ['Firmware', 'firmwareVersion'], ['Build', 'firmwareReleasedDate'],
        ['Boot Version', 'bootVersion'], ['MAC', 'macAddress']
      ];
      var html = '';
      for (var i = 0; i < fields.length; i++) {
        html += '<tr><td>' + fields[i][0] + '</td><td>' + self.xmlVal(xml, fields[i][1]) + '</td></tr>';
      }
      html += '<tr><td>Web UI</td><td>v' + self.VERSION + '</td></tr>';
      document.getElementById('sys-info').innerHTML = html;
    });

    // load storage
    self.apiGet('/ISAPI/ContentMgmt/Storage', function(err, xml) {
      var el = document.getElementById('sys-storage');
      if (err) {
        el.textContent = 'No storage device';
        return;
      }
      var hdds = xml.match(/<hdd>[\s\S]*?<\/hdd>/g) || [];
      if (hdds.length === 0) {
        el.textContent = 'No storage device';
        return;
      }
      var html = '';
      for (var i = 0; i < hdds.length; i++) {
        var hdd = hdds[i];
        var id = self.xmlVal(hdd, 'id');
        var name = self.xmlVal(hdd, 'hddName') || ('Storage ' + id);
        var status = self.xmlVal(hdd, 'status') || 'unknown';
        var cap = self.xmlVal(hdd, 'capacity');
        var free = self.xmlVal(hdd, 'freeSpace');
        html += '<div>' + self.esc(name) + ': ' + status;
        if (cap) html += ' (' + cap + ' MB total';
        if (free) html += ', ' + free + ' MB free';
        if (cap) html += ')';
        html += '</div>';
      }
      el.innerHTML = html;
    });
  },

  upgradeFirmware: function() {
    var self = this;
    var file = document.getElementById('fw-file').files[0];
    if (!file) return self.toast('Select a firmware file first', 'err');
    if (!confirm('Upload ' + file.name + ' (' + (file.size / 1048576).toFixed(1) + ' MB)? The camera will reboot after upgrade.')) return;

    var xhr = new XMLHttpRequest();
    var prog = document.getElementById('fw-progress');
    var bar = document.getElementById('fw-bar');
    var status = document.getElementById('fw-status');
    prog.classList.remove('hidden');
    bar.style.width = '0%';
    status.textContent = 'Uploading...';

    xhr.upload.onprogress = function(e) {
      if (e.lengthComputable) {
        var pct = Math.round(e.loaded / e.total * 100);
        bar.style.width = pct + '%';
        status.textContent = 'Uploading... ' + pct + '%';
      }
    };
    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        bar.style.width = '100%';
        status.textContent = 'Upgrade accepted. Camera is rebooting...';
        self.toast('Firmware upgrade started', 'ok');
      } else {
        status.textContent = 'Upgrade failed (HTTP ' + xhr.status + ')';
        self.toast('Firmware upgrade failed', 'err');
      }
    };
    xhr.onerror = function() {
      status.textContent = 'Upload failed (network error)';
    };
    xhr.open('PUT', self.apiUrl('/ISAPI/System/updateFirmware'), true);
    xhr.send(file);
  },

  exportConfig: function() {
    var self = this;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', self.apiUrl('/ISAPI/System/configurationData'), true);
    xhr.responseType = 'blob';
    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(xhr.response);
        a.download = 'config_backup.bin';
        a.click();
        setTimeout(function() { URL.revokeObjectURL(a.href); }, 1000);
        self.toast('Config exported', 'ok');
      } else {
        self.toast('Export failed', 'err');
      }
    };
    xhr.send();
  },

  importConfig: function() {
    var self = this;
    var file = document.getElementById('cfg-file').files[0];
    if (!file) return self.toast('Select a config file first', 'err');
    if (!confirm('Import configuration? The camera may reboot.')) return;
    self.apiPut('/ISAPI/System/configurationData', file, function(err) {
      if (err) return self.toast('Import failed', 'err');
      self.toast('Config imported. Camera may reboot.', 'ok');
    });
  },

  reboot: function() {
    var self = this;
    if (!confirm('Reboot the camera?')) return;
    self.apiPut('/ISAPI/System/reboot', '<?xml version="1.0" encoding="UTF-8"?><reboot/>', function() {
      self.toast('Camera is rebooting...', 'ok');
    });
  },

  // --- Init ---
  init: function() {
    var self = this;

    // Login form
    document.getElementById('login-form').onsubmit = function(e) {
      e.preventDefault();
      self.login(document.getElementById('login-user').value, document.getElementById('login-pass').value);
    };

    // Logout
    document.getElementById('btn-logout').onclick = function() { self.logout(); };

    // Nav tabs
    var tabs = document.querySelectorAll('.nav-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].onclick = function(e) {
        e.preventDefault();
        self.navigate(this.getAttribute('data-page'));
      };
    }

    // Config tabs
    var ctabs = document.querySelectorAll('.config-tab');
    for (var i = 0; i < ctabs.length; i++) {
      ctabs[i].onclick = function(e) {
        e.preventDefault();
        self.initConfig(this.getAttribute('data-cfg'));
      };
    }

    // Stream tabs (video config)
    var stabs = document.querySelectorAll('.stream-tab');
    for (var i = 0; i < stabs.length; i++) {
      stabs[i].onclick = function() {
        self.loadVideoStream(parseInt(this.getAttribute('data-ch')));
      };
    }

    // Live controls
    document.getElementById('btn-stream-toggle').onclick = function() { self.toggleStream(); };
    document.getElementById('btn-capture').onclick = function() { self.capture(); };
    document.getElementById('btn-fullscreen').onclick = function() { self.fullscreen(); };
    document.getElementById('sel-stream').onchange = function() {
      if (self.streaming) location.reload();
    };

    // Populate mode selector based on protocol
    var modeSelect = document.getElementById('sel-mode');
    if (location.protocol === 'http:') {
      modeSelect.innerHTML = '<option value="h264">H.264 Stream</option><option value="jpeg">JPEG Snapshots</option>';
    } else {
      modeSelect.innerHTML = '<option value="jpeg">JPEG Snapshots</option>';
    }

    // Bind all sliders
    var sliderIds = ['img-brightness', 'img-contrast', 'img-saturation', 'img-sharpness', 'img-wdr-level', 'md-sensitivity'];
    for (var i = 0; i < sliderIds.length; i++) {
      self.bindSlider(sliderIds[i]);
    }

    // Restore session
    var auth = sessionStorage.getItem('auth');
    if (auth) {
      try {
        var parts = atob(auth).split(':');
        var u = parts.shift();
        var p = parts.join(':');
        self.user = u;
        self.pass = p;
        self.apiGet('/ISAPI/Security/userCheck?timeStamp=' + Date.now(), function(err) {
          if (!err) {
            document.getElementById('login-page').classList.add('hidden');
            document.getElementById('app').classList.remove('hidden');
            self.loadDeviceInfo();
            self.navigate('live');
          } else {
            self.user = null;
            self.pass = null;
            sessionStorage.removeItem('auth');
          }
        });
      } catch(e) {
        sessionStorage.removeItem('auth');
      }
    }
  }
};

document.addEventListener('DOMContentLoaded', function() { App.init(); });
