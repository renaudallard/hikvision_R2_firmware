<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>IP Camera</title>
<link rel="stylesheet" href="style.css">
</head>
<body>

<!-- Login -->
<div id="login-page" class="page">
  <form id="login-form" autocomplete="on">
    <h1>IP Camera</h1>
    <div id="login-model" class="login-model"></div>
    <div id="login-version" class="login-model"></div>
    <input type="text" id="login-user" name="username" placeholder="Username" autocomplete="username" required>
    <input type="password" id="login-pass" name="password" placeholder="Password" autocomplete="current-password" required>
    <button type="submit">Log In</button>
    <div id="login-error" class="error"></div>
  </form>
</div>

<!-- App -->
<div id="app" class="hidden">

  <!-- Header -->
  <header>
    <span id="cam-name" class="cam-name">IP Camera</span>
    <nav>
      <a href="#live" class="nav-tab active" data-page="live">Live View</a>
      <a href="#config" class="nav-tab" data-page="config">Configuration</a>
      <a href="#system" class="nav-tab" data-page="system">System</a>
    </nav>
    <button id="btn-logout" class="btn-logout">Logout</button>
  </header>

  <main>
    <!-- Live View -->
    <section id="page-live" class="page-content">
      <div class="live-container">
        <div class="live-video">
          <canvas id="live-canvas" style="display:none;max-width:100%;max-height:100%"></canvas>
          <img id="live-img" alt="Live View">
          <div id="live-msg" class="live-msg">Click Start to begin live view</div>
        </div>
        <div class="live-controls">
          <button id="btn-stream-toggle" class="btn primary">Start</button>
          <select id="sel-stream">
            <option value="101">Main Stream</option>
            <option value="102" selected>Sub Stream</option>
          </select>
          <select id="sel-mode"></select>
          <button id="btn-capture" class="btn">Capture</button>
          <button id="btn-fullscreen" class="btn">Fullscreen</button>
          <span id="live-fps" class="live-fps"></span>
        </div>
      </div>
    </section>

    <!-- Configuration -->
    <section id="page-config" class="page-content hidden">
      <div class="config-layout">
        <nav class="config-menu">
          <a href="#" class="config-tab active" data-cfg="network">Network</a>
          <a href="#" class="config-tab" data-cfg="wifi">WiFi</a>
          <a href="#" class="config-tab" data-cfg="ports">Ports</a>
          <a href="#" class="config-tab" data-cfg="video">Video</a>
          <a href="#" class="config-tab" data-cfg="image">Image</a>
          <a href="#" class="config-tab" data-cfg="osd">OSD</a>
          <a href="#" class="config-tab" data-cfg="audio">Audio</a>
          <a href="#" class="config-tab" data-cfg="motion">Motion Detection</a>
          <a href="#" class="config-tab" data-cfg="pir">PIR</a>
          <a href="#" class="config-tab" data-cfg="email">Email</a>
          <a href="#" class="config-tab" data-cfg="ftp">FTP</a>
          <a href="#" class="config-tab" data-cfg="ddns">DDNS</a>
          <a href="#" class="config-tab" data-cfg="time">Time</a>
          <a href="#" class="config-tab" data-cfg="users">Users</a>
          <a href="#" class="config-tab" data-cfg="devname">Device Name</a>
        </nav>
        <div class="config-panel">
          <div id="cfg-loading" class="cfg-loading">Loading...</div>

          <!-- Network -->
          <div id="cfg-network" class="cfg-section hidden">
            <h2>Network</h2>
            <div class="form-grid">
              <label>Addressing</label>
              <select id="net-addressing"><option value="static">Static</option><option value="dynamic">DHCP</option></select>
              <label>IP Address</label>
              <input type="text" id="net-ip">
              <label>Subnet Mask</label>
              <input type="text" id="net-mask">
              <label>Gateway</label>
              <input type="text" id="net-gw">
              <label>Primary DNS</label>
              <input type="text" id="net-dns1">
              <label>Secondary DNS</label>
              <input type="text" id="net-dns2">
              <label>MAC Address</label>
              <input type="text" id="net-mac" readonly>
            </div>
            <div class="form-actions"><button class="btn primary" onclick="App.saveNetwork()">Save</button></div>
          </div>

          <!-- WiFi -->
          <div id="cfg-wifi" class="cfg-section hidden">
            <h2>WiFi</h2>
            <div class="form-actions" style="margin-bottom:12px">
              <button class="btn primary" onclick="App.wifiScan()">Scan Networks</button>
              <span id="wifi-status" class="status-text"></span>
            </div>
            <table id="wifi-table" class="data-table">
              <thead><tr><th>SSID</th><th>Signal</th><th>Security</th><th>Status</th><th></th></tr></thead>
              <tbody id="wifi-list"></tbody>
            </table>
            <div id="wifi-connect-box" class="hidden" style="margin-top:16px">
              <h3>Connect to: <span id="wifi-connect-ssid"></span></h3>
              <input type="hidden" id="wifi-connect-ssid-val">
              <input type="hidden" id="wifi-connect-sec-val">
              <div class="form-grid">
                <label>Password</label>
                <input type="password" id="wifi-connect-key">
              </div>
              <div class="form-actions">
                <button class="btn primary" onclick="App.wifiDoConnect()">Connect</button>
                <button class="btn" onclick="App.wifiCancelConnect()">Cancel</button>
              </div>
            </div>
          </div>

          <!-- Ports -->
          <div id="cfg-ports" class="cfg-section hidden">
            <h2>Ports</h2>
            <div class="form-grid">
              <label>HTTP</label>
              <input type="number" id="port-http">
              <label>HTTPS</label>
              <input type="number" id="port-https">
              <label>RTSP</label>
              <input type="number" id="port-rtsp">
              <label>SDK (DEV_MANAGE)</label>
              <input type="number" id="port-sdk">
            </div>
            <div class="form-actions"><button class="btn primary" onclick="App.savePorts()">Save</button></div>
          </div>

          <!-- Video -->
          <div id="cfg-video" class="cfg-section hidden">
            <h2>Video Streams</h2>
            <div class="stream-tabs">
              <button class="btn stream-tab active" data-ch="101">Main (101)</button>
              <button class="btn stream-tab" data-ch="102">Sub (102)</button>
              <button class="btn stream-tab" data-ch="103">Third (103)</button>
            </div>
            <div class="form-grid" id="vid-form">
              <label>Resolution</label>
              <span id="vid-res"></span>
              <label>Codec</label>
              <select id="vid-codec"><option value="H.264">H.264</option><option value="H.265">H.265</option><option value="MJPEG">MJPEG</option></select>
              <label>Quality Type</label>
              <select id="vid-qtype"><option value="VBR">VBR</option><option value="CBR">CBR</option></select>
              <label>Bitrate (kbps)</label>
              <input type="number" id="vid-bitrate" min="32" max="16384">
              <label>Frame Rate</label>
              <input type="number" id="vid-fps" min="1" max="30">
              <label>H.264 Profile</label>
              <select id="vid-profile"><option value="baseline">Baseline</option><option value="main">Main</option><option value="high">High</option></select>
            </div>
            <div class="form-actions"><button class="btn primary" onclick="App.saveVideo()">Save</button></div>
          </div>

          <!-- Image -->
          <div id="cfg-image" class="cfg-section hidden">
            <h2>Image</h2>
            <div class="form-grid">
              <label>Brightness <span id="img-brightness-val" class="slider-val"></span></label>
              <input type="range" id="img-brightness" min="0" max="100">
              <label>Contrast <span id="img-contrast-val" class="slider-val"></span></label>
              <input type="range" id="img-contrast" min="0" max="100">
              <label>Saturation <span id="img-saturation-val" class="slider-val"></span></label>
              <input type="range" id="img-saturation" min="0" max="100">
              <label>Sharpness <span id="img-sharpness-val" class="slider-val"></span></label>
              <input type="range" id="img-sharpness" min="0" max="100">
            </div>
            <div class="form-actions"><button class="btn primary" onclick="App.saveImageColor()">Save</button></div>

            <h3>WDR</h3>
            <div class="form-grid">
              <label>Mode</label>
              <select id="img-wdr-mode"><option value="open">Open</option><option value="close">Close</option></select>
              <label>Level <span id="img-wdr-level-val" class="slider-val"></span></label>
              <input type="range" id="img-wdr-level" min="0" max="100">
            </div>
            <div class="form-actions"><button class="btn primary" onclick="App.saveWdr()">Save</button></div>

            <h3>IR Cut Filter</h3>
            <div class="form-grid">
              <label>Type</label>
              <select id="img-ircut"><option value="auto">Auto</option><option value="day">Day</option><option value="night">Night</option></select>
            </div>
            <div class="form-actions"><button class="btn primary" onclick="App.saveIRCut()">Save</button></div>

            <h3>Day/Night (ISP Mode)</h3>
            <div class="form-grid">
              <label>Mode</label>
              <select id="img-isp-mode"><option value="auto">Auto</option><option value="schedule">Schedule</option></select>
            </div>
            <div class="form-actions"><button class="btn primary" onclick="App.saveISPMode()">Save</button></div>

            <h3>Mirror / Flip</h3>
            <div class="form-grid">
              <label>Enabled</label>
              <select id="img-flip"><option value="true">Yes</option><option value="false">No</option></select>
            </div>
            <div class="form-actions"><button class="btn primary" onclick="App.saveFlip()">Save</button></div>
          </div>

          <!-- OSD -->
          <div id="cfg-osd" class="cfg-section hidden">
            <h2>OSD Overlays</h2>
            <div class="form-grid">
              <label>Date/Time Overlay</label>
              <select id="osd-dt-enabled"><option value="true">Enabled</option><option value="false">Disabled</option></select>
              <label>Date Format</label>
              <select id="osd-date-style">
                <option value="MM-DD-YYYY">MM-DD-YYYY</option>
                <option value="DD-MM-YYYY">DD-MM-YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
              <label>Display Week</label>
              <select id="osd-week"><option value="true">Yes</option><option value="false">No</option></select>
              <label>Channel Name Overlay</label>
              <select id="osd-ch-enabled"><option value="true">Enabled</option><option value="false">Disabled</option></select>
            </div>
            <div class="form-actions"><button class="btn primary" onclick="App.saveOsd()">Save</button></div>
          </div>

          <!-- Audio -->
          <div id="cfg-audio" class="cfg-section hidden">
            <h2>Audio</h2>
            <div class="form-grid">
              <label>Enabled</label>
              <select id="audio-enabled"><option value="true">Yes</option><option value="false">No</option></select>
            </div>
            <div class="form-actions"><button class="btn primary" onclick="App.saveAudio()">Save</button></div>
          </div>

          <!-- Motion Detection -->
          <div id="cfg-motion" class="cfg-section hidden">
            <h2>Motion Detection</h2>
            <div class="form-grid">
              <label>Enabled</label>
              <select id="md-enabled"><option value="true">Yes</option><option value="false">No</option></select>
              <label>Sensitivity <span id="md-sensitivity-val" class="slider-val"></span></label>
              <input type="range" id="md-sensitivity" min="0" max="100">
            </div>
            <div class="form-actions"><button class="btn primary" onclick="App.saveMotion()">Save</button></div>
          </div>

          <!-- PIR -->
          <div id="cfg-pir" class="cfg-section hidden">
            <h2>PIR Sensor</h2>
            <div id="pir-info" class="info-block">Loading...</div>
          </div>

          <!-- Email -->
          <div id="cfg-email" class="cfg-section hidden">
            <h2>Email (SMTP)</h2>
            <div class="form-grid">
              <label>SMTP Server</label>
              <input type="text" id="em-host">
              <label>Port</label>
              <input type="number" id="em-port">
              <label>SSL/TLS</label>
              <select id="em-ssl"><option value="true">Enabled</option><option value="false">Disabled</option></select>
              <label>Authentication</label>
              <select id="em-auth"><option value="true">Enabled</option><option value="false">Disabled</option></select>
              <label>Account Name</label>
              <input type="text" id="em-account">
              <label>Sender Address</label>
              <input type="text" id="em-sender">
              <label>Receiver 1</label>
              <input type="text" id="em-recv1">
              <label>Receiver 2</label>
              <input type="text" id="em-recv2">
              <label>Receiver 3</label>
              <input type="text" id="em-recv3">
              <label>Attach Snapshot</label>
              <select id="em-snapshot"><option value="true">Yes</option><option value="false">No</option></select>
            </div>
            <div class="form-actions"><button class="btn primary" onclick="App.saveEmail()">Save</button></div>
          </div>

          <!-- FTP -->
          <div id="cfg-ftp" class="cfg-section hidden">
            <h2>FTP</h2>
            <div class="form-grid">
              <label>Enabled</label>
              <select id="ftp-enabled"><option value="true">Yes</option><option value="false">No</option></select>
              <label>Server IP</label>
              <input type="text" id="ftp-ip">
              <label>Port</label>
              <input type="number" id="ftp-port">
              <label>Username</label>
              <input type="text" id="ftp-user">
              <label>Anonymous</label>
              <select id="ftp-anon"><option value="true">Yes</option><option value="false">No</option></select>
            </div>
            <div class="form-actions"><button class="btn primary" onclick="App.saveFtp()">Save</button></div>
          </div>

          <!-- DDNS -->
          <div id="cfg-ddns" class="cfg-section hidden">
            <h2>DDNS</h2>
            <div class="form-grid">
              <label>Enabled</label>
              <select id="ddns-enabled"><option value="true">Yes</option><option value="false">No</option></select>
              <label>Provider</label>
              <input type="text" id="ddns-provider">
              <label>Server</label>
              <input type="text" id="ddns-server">
              <label>Domain Name</label>
              <input type="text" id="ddns-domain">
              <label>Username</label>
              <input type="text" id="ddns-user">
            </div>
            <div class="form-actions"><button class="btn primary" onclick="App.saveDdns()">Save</button></div>
          </div>

          <!-- Time -->
          <div id="cfg-time" class="cfg-section hidden">
            <h2>Time</h2>
            <div class="form-grid">
              <label>Mode</label>
              <select id="time-mode"><option value="NTP">NTP</option><option value="manual">Manual</option></select>
              <label>NTP Server</label>
              <input type="text" id="time-ntp">
              <label>Sync Interval (min)</label>
              <input type="number" id="time-interval" min="1" max="10080">
              <label>Current Time</label>
              <span id="time-current"></span>
            </div>
            <div class="form-actions"><button class="btn primary" onclick="App.saveTime()">Save</button></div>
          </div>

          <!-- Users -->
          <div id="cfg-users" class="cfg-section hidden">
            <h2>Change Password</h2>
            <div class="form-grid">
              <label>Username</label>
              <span id="user-name"></span>
              <label>New Password</label>
              <input type="password" id="user-newpass" maxlength="16">
              <label>Confirm Password</label>
              <input type="password" id="user-confirm" maxlength="16">
            </div>
            <div class="form-actions"><button class="btn primary" onclick="App.savePassword()">Change Password</button></div>
          </div>

          <!-- Device Name -->
          <div id="cfg-devname" class="cfg-section hidden">
            <h2>Device Name</h2>
            <div class="form-grid">
              <label>Name</label>
              <input type="text" id="devname-input" maxlength="32">
            </div>
            <div class="form-actions"><button class="btn primary" onclick="App.saveDevName()">Save</button></div>
          </div>

        </div>
      </div>
    </section>

    <!-- System -->
    <section id="page-system" class="page-content hidden">
      <div class="system-layout">
        <div class="sys-card">
          <h2>Device Information</h2>
          <table id="sys-info"></table>
        </div>
        <div class="sys-card">
          <h2>Firmware Upgrade</h2>
          <p>Select a firmware file (digicap.dav) to upload.</p>
          <input type="file" id="fw-file" accept=".dav,.bin,.img">
          <div id="fw-progress" class="progress hidden"><div id="fw-bar" class="progress-bar"></div></div>
          <div id="fw-status"></div>
          <button class="btn primary" onclick="App.upgradeFirmware()">Upload and Upgrade</button>
        </div>
        <div class="sys-card">
          <h2>Configuration Backup</h2>
          <button class="btn" onclick="App.exportConfig()">Export Config</button>
          <hr>
          <input type="file" id="cfg-file" accept=".bin">
          <button class="btn" onclick="App.importConfig()">Import Config</button>
        </div>
        <div class="sys-card">
          <h2>Maintenance</h2>
          <button class="btn warn" onclick="App.reboot()">Reboot Camera</button>
        </div>
        <div class="sys-card">
          <h2>Storage</h2>
          <div id="sys-storage">Loading...</div>
        </div>
      </div>
    </section>
  </main>

  <div id="toast" class="toast hidden"></div>
</div>

<script src="h264decoder.js"></script>
<script src="rtsp.js"></script>
<script src="app.js"></script>
</body>
</html>
