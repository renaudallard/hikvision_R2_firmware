<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>IP Camera</title>
<link rel="stylesheet" href="style.css">
</head>
<body>

<div id="login-page" class="page">
  <form id="login-form" autocomplete="on">
    <h1>IP Camera</h1>
    <div id="login-model" class="login-model"></div>
    <input type="text" id="login-user" name="username" placeholder="Username" autocomplete="username" required>
    <input type="password" id="login-pass" name="password" placeholder="Password" autocomplete="current-password" required>
    <button type="submit">Log In</button>
    <div id="login-error" class="error"></div>
  </form>
</div>

<div id="app" class="hidden">
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
          <img id="live-img" alt="Live View">
          <div id="live-msg" class="live-msg">Click Start to begin live view</div>
        </div>
        <div class="live-controls">
          <button id="btn-stream-toggle" class="btn primary">Start</button>
          <select id="sel-stream">
            <option value="101">Main Stream (1080p)</option>
            <option value="102" selected>Sub Stream</option>
          </select>
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
          <a href="#" class="config-tab" data-cfg="video">Video</a>
          <a href="#" class="config-tab" data-cfg="image">Image</a>
          <a href="#" class="config-tab" data-cfg="time">Date / Time</a>
          <a href="#" class="config-tab" data-cfg="users">Users</a>
        </nav>
        <div class="config-panel">
          <div id="cfg-loading" class="cfg-loading">Loading...</div>

          <div id="cfg-network" class="cfg-section">
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

          <div id="cfg-video" class="cfg-section hidden">
            <h2>Video</h2>
            <h3>Main Stream (101)</h3>
            <div class="form-grid" id="vid-main">
              <label>Resolution</label>
              <span id="vid-main-res"></span>
              <label>Codec</label>
              <span id="vid-main-codec"></span>
              <label>Max Bitrate (kbps)</label>
              <input type="number" id="vid-main-bitrate" min="32" max="16384">
              <label>Max Frame Rate</label>
              <input type="number" id="vid-main-fps" min="1" max="30">
              <label>Quality Type</label>
              <select id="vid-main-qtype"><option value="VBR">VBR</option><option value="CBR">CBR</option></select>
              <label>H.264 Profile</label>
              <select id="vid-main-profile"><option value="Baseline">Baseline</option><option value="Main">Main</option><option value="High">High</option></select>
            </div>
            <div class="form-actions"><button class="btn primary" onclick="App.saveVideo(101)">Save Main</button></div>
            <h3>Sub Stream (102)</h3>
            <div class="form-grid" id="vid-sub">
              <label>Resolution</label>
              <span id="vid-sub-res"></span>
              <label>Codec</label>
              <span id="vid-sub-codec"></span>
              <label>Max Bitrate (kbps)</label>
              <input type="number" id="vid-sub-bitrate" min="32" max="4096">
              <label>Max Frame Rate</label>
              <input type="number" id="vid-sub-fps" min="1" max="30">
            </div>
            <div class="form-actions"><button class="btn primary" onclick="App.saveVideo(102)">Save Sub</button></div>
          </div>

          <div id="cfg-image" class="cfg-section hidden">
            <h2>Image</h2>
            <div class="form-grid">
              <label>Brightness</label>
              <input type="range" id="img-brightness" min="0" max="100"><span id="img-brightness-val"></span>
              <label>Contrast</label>
              <input type="range" id="img-contrast" min="0" max="100"><span id="img-contrast-val"></span>
              <label>Saturation</label>
              <input type="range" id="img-saturation" min="0" max="100"><span id="img-saturation-val"></span>
            </div>
            <div class="form-actions"><button class="btn primary" onclick="App.saveImage()">Save</button></div>
            <h3>IR Cut Filter</h3>
            <div class="form-grid">
              <label>Day/Night Mode</label>
              <select id="img-ircut"><option value="auto">Auto</option><option value="day">Day</option><option value="night">Night</option></select>
            </div>
            <div class="form-actions"><button class="btn primary" onclick="App.saveIRCut()">Save</button></div>
          </div>

          <div id="cfg-time" class="cfg-section hidden">
            <h2>Date / Time</h2>
            <div class="form-grid">
              <label>Mode</label>
              <select id="time-mode"><option value="NTP">NTP</option><option value="manual">Manual</option></select>
              <label>Camera Time</label>
              <span id="time-current"></span>
              <label>NTP Server</label>
              <input type="text" id="time-ntp">
              <label>Sync Interval (min)</label>
              <input type="number" id="time-interval" min="1" max="10080">
            </div>
            <div class="form-actions"><button class="btn primary" onclick="App.saveTime()">Save</button></div>
          </div>

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
          <input type="file" id="fw-file" accept=".dav">
          <div id="fw-progress" class="progress hidden"><div id="fw-bar" class="progress-bar"></div></div>
          <div id="fw-status"></div>
          <button class="btn primary" onclick="App.upgradeFirmware()">Upload &amp; Upgrade</button>
        </div>
        <div class="sys-card">
          <h2>Configuration Backup</h2>
          <button class="btn" onclick="App.exportConfig()">Export Config</button>
          <input type="file" id="cfg-file" accept=".bin">
          <button class="btn" onclick="App.importConfig()">Import Config</button>
        </div>
        <div class="sys-card">
          <h2>Maintenance</h2>
          <button class="btn warn" onclick="App.reboot()">Reboot Camera</button>
        </div>
      </div>
    </section>
  </main>

  <div id="toast" class="toast hidden"></div>
</div>

<script src="app.js"></script>
</body>
</html>
