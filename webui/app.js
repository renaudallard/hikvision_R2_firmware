var App = {
  user: null,
  pass: null,
  streaming: false,
  streamTimer: null,
  frameCount: 0,
  fpsTimer: null,
  lastFpsTime: 0,

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
    return xml.replace(new RegExp('(<' + tag + '[^>]*>)[^<]*(</'+tag+'>)'), '$1' + val + '$2');
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
    var img = document.getElementById('live-img');
    var msg = document.getElementById('live-msg');
    self.streaming = true;
    self.frameCount = 0;
    self.lastFpsTime = Date.now();
    document.getElementById('btn-stream-toggle').textContent = 'Stop';
    msg.textContent = 'Connecting...';

    var fetchFrame = function() {
      if (!self.streaming) return;
      var next = new Image();
      next.onload = function() {
        img.src = next.src;
        img.style.display = 'block';
        msg.style.display = 'none';
        self.frameCount++;
        self.streamTimer = setTimeout(fetchFrame, 100);
      };
      next.onerror = function() {
        self.streamTimer = setTimeout(fetchFrame, 1000);
      };
      next.src = self.apiUrl('/ISAPI/Streaming/channels/' + ch + '/picture') + '&_=' + Date.now();
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
  },

  stopStream: function() {
    this.streaming = false;
    clearTimeout(this.streamTimer);
    clearInterval(this.fpsTimer);
    this.streamTimer = null;
    var btn = document.getElementById('btn-stream-toggle');
    if (btn) btn.textContent = 'Start';
    var fps = document.getElementById('live-fps');
    if (fps) fps.textContent = '';
  },

  capture: function() {
    var img = document.getElementById('live-img');
    if (!img.src || img.style.display === 'none') return;
    var c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
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
    else if (section === 'video') this.loadVideo();
    else if (section === 'image') this.loadImage();
    else if (section === 'time') this.loadTime();
    else if (section === 'users') this.loadUsers();
  },

  showCfg: function(id) {
    document.getElementById('cfg-loading').classList.add('hidden');
    document.getElementById(id).classList.remove('hidden');
  },

  // Network
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

  // Video
  loadVideo: function() {
    var self = this;
    var loaded = 0;
    var done = function() { if (++loaded >= 2) self.showCfg('cfg-video'); };

    self.apiGet('/ISAPI/Streaming/channels/101', function(err, xml) {
      if (!err) {
        self._vidMain = xml;
        document.getElementById('vid-main-res').textContent = self.xmlVal(xml, 'videoResolutionWidth') + 'x' + self.xmlVal(xml, 'videoResolutionHeight');
        document.getElementById('vid-main-codec').textContent = self.xmlVal(xml, 'videoCodecType');
        document.getElementById('vid-main-bitrate').value = self.xmlVal(xml, 'vbrUpperCap') || self.xmlVal(xml, 'constantBitRate');
        var fps = parseInt(self.xmlVal(xml, 'maxFrameRate')) || 2500;
        document.getElementById('vid-main-fps').value = Math.round(fps / 100);
        document.getElementById('vid-main-qtype').value = self.xmlVal(xml, 'videoQualityControlType');
        document.getElementById('vid-main-profile').value = self.xmlVal(xml, 'H264Profile');
      }
      done();
    });

    self.apiGet('/ISAPI/Streaming/channels/102', function(err, xml) {
      if (!err) {
        self._vidSub = xml;
        document.getElementById('vid-sub-res').textContent = self.xmlVal(xml, 'videoResolutionWidth') + 'x' + self.xmlVal(xml, 'videoResolutionHeight');
        document.getElementById('vid-sub-codec').textContent = self.xmlVal(xml, 'videoCodecType');
        document.getElementById('vid-sub-bitrate').value = self.xmlVal(xml, 'vbrUpperCap') || self.xmlVal(xml, 'constantBitRate');
        var fps = parseInt(self.xmlVal(xml, 'maxFrameRate')) || 2500;
        document.getElementById('vid-sub-fps').value = Math.round(fps / 100);
      }
      done();
    });
  },

  saveVideo: function(ch) {
    var self = this;
    var xml = ch === 101 ? self._vidMain : self._vidSub;
    if (!xml) return;
    var prefix = ch === 101 ? 'vid-main' : 'vid-sub';
    var bitrate = document.getElementById(prefix + '-bitrate').value;
    var fps = document.getElementById(prefix + '-fps').value;
    xml = self.xmlSet(xml, 'vbrUpperCap', bitrate);
    xml = self.xmlSet(xml, 'constantBitRate', bitrate);
    xml = self.xmlSet(xml, 'maxFrameRate', parseInt(fps) * 100);
    if (ch === 101) {
      xml = self.xmlSet(xml, 'videoQualityControlType', document.getElementById('vid-main-qtype').value);
      xml = self.xmlSet(xml, 'H264Profile', document.getElementById('vid-main-profile').value);
    }
    self.apiPut('/ISAPI/Streaming/channels/' + ch, xml, function(err) {
      if (err) return self.toast('Failed to save video config', 'err');
      self.toast('Video config saved', 'ok');
    });
  },

  // Image
  loadImage: function() {
    var self = this;
    var loaded = 0;
    var done = function() { if (++loaded >= 2) self.showCfg('cfg-image'); };

    self.apiGet('/ISAPI/Image/channels/1/color', function(err, xml) {
      if (!err) {
        self._imgColor = xml;
        var fields = ['brightness', 'contrast', 'saturation'];
        for (var i = 0; i < fields.length; i++) {
          var v = self.xmlVal(xml, fields[i] + 'Level') || '50';
          document.getElementById('img-' + fields[i]).value = v;
          document.getElementById('img-' + fields[i] + '-val').textContent = v;
        }
      }
      done();
    });

    self.apiGet('/ISAPI/Image/channels/1/irCutFilter', function(err, xml) {
      if (!err) {
        self._imgIR = xml;
        var mode = self.xmlVal(xml, 'IrcutFilterType') || 'auto';
        document.getElementById('img-ircut').value = mode;
      }
      done();
    });
  },

  saveImage: function() {
    var self = this;
    var xml = self._imgColor;
    if (!xml) return;
    xml = self.xmlSet(xml, 'brightnessLevel', document.getElementById('img-brightness').value);
    xml = self.xmlSet(xml, 'contrastLevel', document.getElementById('img-contrast').value);
    xml = self.xmlSet(xml, 'saturationLevel', document.getElementById('img-saturation').value);
    self.apiPut('/ISAPI/Image/channels/1/color', xml, function(err) {
      if (err) return self.toast('Failed to save image settings', 'err');
      self.toast('Image settings saved', 'ok');
    });
  },

  saveIRCut: function() {
    var self = this;
    var xml = self._imgIR;
    if (!xml) return;
    xml = self.xmlSet(xml, 'IrcutFilterType', document.getElementById('img-ircut').value);
    self.apiPut('/ISAPI/Image/channels/1/irCutFilter', xml, function(err) {
      if (err) return self.toast('Failed to save IR cut filter', 'err');
      self.toast('IR cut filter saved', 'ok');
    });
  },

  // Time
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

    self.apiGet('/ISAPI/System/time/ntpServers', function(err, xml) {
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
      nxml = nxml.replace(/(<NTPServer[^>]*>[\s\S]*?<ipAddress>)[^<]*/, '$1' + document.getElementById('time-ntp').value);
      nxml = self.xmlSet(nxml, 'synchronizeInterval', document.getElementById('time-interval').value);
      self.apiPut('/ISAPI/System/time/ntpServers/1', nxml, function(err) { if (err) errs++; checkDone(); });
    }
  },

  // Users
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
      document.getElementById('sys-info').innerHTML = html;
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

    // Live controls
    document.getElementById('btn-stream-toggle').onclick = function() { self.toggleStream(); };
    document.getElementById('btn-capture').onclick = function() { self.capture(); };
    document.getElementById('btn-fullscreen').onclick = function() { self.fullscreen(); };
    document.getElementById('sel-stream').onchange = function() {
      if (self.streaming) { self.stopStream(); self.startStream(); }
    };

    // Image sliders - update value display
    var sliders = ['brightness', 'contrast', 'saturation'];
    for (var i = 0; i < sliders.length; i++) {
      (function(name) {
        var el = document.getElementById('img-' + name);
        if (el) el.oninput = function() { document.getElementById('img-' + name + '-val').textContent = this.value; };
      })(sliders[i]);
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
