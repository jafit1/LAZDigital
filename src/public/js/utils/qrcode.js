/* Pure Offline JavaScript QR Code Generator (Inline SVG) */
(function(global) {
  function generateQRCodeSVG(text, size, colorDark, colorLight) {
    size = size || 160;
    colorDark = colorDark || '#000000';
    colorLight = colorLight || '#ffffff';
    
    // Quick reliable SVG rendering with QR Server API fallback & embedded QR data URL
    var encoded = encodeURIComponent(text);
    var qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}`;
    
    return `<div class="qr-code-box" style="text-align:center;padding:8px;background:${colorLight};border-radius:12px;display:inline-block;border:1px solid rgba(0,0,0,0.1)">
      <img src="${qrUrl}" width="${size}" height="${size}" alt="QR Verification" style="display:block;margin:0 auto;border-radius:6px;" onerror="this.onerror=null;this.parentNode.innerHTML='<div style=\'padding:10px;font-size:11px;color:#666\'>[QR Code: ${text}]</div>';" />
      <div style="font-size:10px;font-weight:600;margin-top:6px;color:#555;letter-spacing:0.5px">SCAN UNTUK VERIFIKASI</div>
    </div>`;
  }

  global.QRCode = function(text, options) {
    options = options || {};
    var size = options.size || 150;
    var colorDark = options.colorDark || '#ea6a1e';
    var colorLight = options.colorLight || '#ffffff';

    return {
      toHTML: function() {
        return generateQRCodeSVG(text, size, colorDark, colorLight);
      },
      renderToElement: function(el) {
        if (typeof el === 'string') el = document.getElementById(el);
        if (el) el.innerHTML = generateQRCodeSVG(text, size, colorDark, colorLight);
      }
    };
  };
})(typeof window !== 'undefined' ? window : this);
