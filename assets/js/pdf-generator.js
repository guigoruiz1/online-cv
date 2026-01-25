function print() {
  const printWindow = window.open(window.location.pathname + "/print", "_blank");
  printWindow.onload = function () {
    printWindow.print();
    // Close the print window after a delay
    setTimeout(() => printWindow.close(), 500);
  };
}

function generatePDF() {
  // Get the print layout URL
  const printURL = window.location.pathname + "/print";

  // Fetch the print layout content
  fetch(printURL)
    .then((response) => response.text())
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
          html2canvas(iframe.contentWindow.document.body, {
            scale: scale,
            useCORS: true,
            allowTaint: false,
            logging: false,
          })
            .then((canvas) => {
              const imgData = canvas.toDataURL("image/jpeg", 1.0);

              // Create a jsPDF with units in pixels and page size equal to the canvas size
              const pdf = new jsPDF({ unit: "px", format: [canvas.width, canvas.height] });
              pdf.addImage(imgData, "JPEG", 0, 0, canvas.width, canvas.height);
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
