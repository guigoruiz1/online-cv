function print() {
  const printWindow = window.open(window.location.pathname + "/print", "_blank");
  printWindow.onload = function () {
    printWindow.print();
    // Close the print window after a delay
    setTimeout(() => printWindow.close(), 500);
  };
}

function generatePDF() {
  // Helper to load a script if it's not already present
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  // Ensure required libs are available (html2canvas and jsPDF)
  const ensureLibs = () => {
    const promises = [];
    if (typeof window.html2canvas === 'undefined' && typeof window.html2canvas !== 'function') {
      promises.push(loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'));
    }
    if (typeof window.jsPDF === 'undefined' && !(window.jspdf && window.jspdf.jsPDF)) {
      promises.push(loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'));
    }
    return Promise.all(promises);
  };

  // Get the print layout URL
  const printURL = window.location.pathname + "/print";

  // Make sure libs are loaded before fetching and rendering
  ensureLibs()
    .catch((err) => console.warn('Error loading PDF libraries (continuing if already present):', err))
    .then(() => {
      // Fetch the print layout content
      return fetch(printURL).then((response) => response.text());
    })
    .then((html) => {
      // Create a hidden iframe so the fetched HTML can load its styles/assets
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "100%"; // keep off-screen
      iframe.style.width = "800px";
      iframe.style.height = "600px";
      iframe.style.visibility = "hidden";
      document.body.appendChild(iframe);

      const idoc = iframe.contentDocument || iframe.contentWindow.document;
      idoc.open();
      idoc.write(html);
      idoc.close();

      // Wait for iframe resources (fonts/CSS/images) to load
      iframe.onload = function () {
        try {
          // Try to read the name from the print document, fallback to main document
          const nameEl = iframe.contentDocument.querySelector(".name") || document.querySelector(".name");
          const name = (nameEl && nameEl.textContent) ? nameEl.textContent.trim() : "resume";
          const filename = `${name.replace(/\s+/g, "_")}_Resume.pdf`;

          // Resize iframe to match its content so html2canvas captures full resolution
          const body = iframe.contentDocument.body;
          const rect = body.getBoundingClientRect();
          // If rect width/height are zero (rare), fall back to scroll sizes
          const contentWidth = rect.width || Math.max(body.scrollWidth, body.offsetWidth);
          const contentHeight = rect.height || Math.max(body.scrollHeight, body.offsetHeight);
          iframe.style.width = contentWidth + "px";
          iframe.style.height = contentHeight + "px";

          const scale = 2;

          // Wait helper: poll for a condition until timeout
          const waitFor = (checkFn, timeout = 5000, interval = 100) => {
            return new Promise((resolve, reject) => {
              const start = Date.now();
              (function poll() {
                try {
                  if (checkFn()) return resolve(true);
                } catch (e) {
                  // ignore
                }
                if (Date.now() - start > timeout) return reject(new Error('timeout'));
                setTimeout(poll, interval);
              })();
            });
          };

          // Try to obtain html2canvas from iframe context or parent; load if needed
          const getHtml2CanvasFn = () => {
            try {
              if (iframe.contentWindow && typeof iframe.contentWindow.html2canvas === 'function') return iframe.contentWindow.html2canvas;
            } catch (e) { }
            if (typeof window.html2canvas === 'function') return window.html2canvas;
            if (typeof html2canvas === 'function') return html2canvas;
            return null;
          };

          const runHtml2Canvas = () => {
            const options = {
              scale: scale,
              useCORS: true,
              allowTaint: false,
              logging: false,
            };
            let fn = getHtml2CanvasFn();
            if (fn) return Promise.resolve(fn(iframe.contentWindow.document.body, options));
            // load and wait for global
            return loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')
              .then(() => waitFor(() => !!getHtml2CanvasFn(), 5000))
              .then(() => {
                fn = getHtml2CanvasFn();
                if (!fn) throw new Error('html2canvas failed to become available');
                return fn(iframe.contentWindow.document.body, options);
              });
          };

          runHtml2Canvas()
            .then((canvas) => {
              // Some PDF viewers / jsPDF have maximum page height limits.
              // If the captured canvas is too tall, downscale it so we still produce a single page.
              const MAX_PX = 14000; // safe max height in pixels for jsPDF/browser
              let finalCanvas = canvas;
              if (canvas.height > MAX_PX) {
                const scaleDown = MAX_PX / canvas.height;
                const scaledW = Math.round(canvas.width * scaleDown);
                const scaledH = Math.round(canvas.height * scaleDown);
                const tmp = document.createElement("canvas");
                tmp.width = scaledW;
                tmp.height = scaledH;
                const ctx = tmp.getContext("2d");
                ctx.drawImage(canvas, 0, 0, scaledW, scaledH);
                finalCanvas = tmp;
              }

              const imgData = finalCanvas.toDataURL("image/jpeg", 1.0);

              // Obtain jsPDF constructor (supports different UMD shapes)
              let jsPDFCtor = window.jsPDF || (window.jspdf && window.jspdf.jsPDF);
              if (!jsPDFCtor) {
                // Try to load jspdf and then obtain constructor
                return loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
                  .then(() => {
                    jsPDFCtor = window.jsPDF || (window.jspdf && window.jspdf.jsPDF);
                    if (!jsPDFCtor) throw new Error('jsPDF failed to load');
                    const pdf = new jsPDFCtor({ unit: 'px', format: [finalCanvas.width, finalCanvas.height] });
                    pdf.addImage(imgData, 'JPEG', 0, 0, finalCanvas.width, finalCanvas.height);
                    pdf.save(filename);
                    document.body.removeChild(iframe);
                  })
                  .catch((err) => {
                    console.error('Error loading jsPDF or creating PDF:', err);
                    document.body.removeChild(iframe);
                  });
              }

              const pdf = new jsPDFCtor({ unit: 'px', format: [finalCanvas.width, finalCanvas.height] });
              pdf.addImage(imgData, 'JPEG', 0, 0, finalCanvas.width, finalCanvas.height);
              pdf.save(filename);
              document.body.removeChild(iframe);
            })
            .catch((err) => {
              console.error("Error generating canvas for PDF:", err);
              document.body.removeChild(iframe);
            });
        } catch (err) {
          console.error("Error preparing print iframe:", err);
          document.body.removeChild(iframe);
        }
      };
      // Fallback: if iframe doesn't fire onload (some browsers), try after a short delay
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          try {
            iframe.onload();
          } catch (e) { }
        }
      }, 1500);
    })
    .catch((err) => console.error("Error fetching print layout:", err));
}
