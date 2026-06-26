// Admin-side progressive enhancement. Loaded from /assets/js/admin.js so that
// the Content-Security-Policy can forbid inline scripts (script-src 'self').
(function () {
  "use strict";

  // Image upload + Markdown insertion (post editor).
  var uploadBtn = document.getElementById("uploadBtn");
  if (uploadBtn) {
    uploadBtn.addEventListener("click", async function () {
      var input = document.getElementById("imageFile");
      var status = document.getElementById("uploadStatus");
      if (!input.files || !input.files[0]) {
        status.textContent = "Choose a file first.";
        return;
      }
      status.textContent = "Uploading…";
      var fd = new FormData();
      fd.append("image", input.files[0]);
      try {
        var res = await fetch("/admin/upload", { method: "POST", body: fd });
        if (!res.ok) throw new Error("upload failed");
        var data = await res.json();
        var textarea = document.getElementById("description");
        textarea.value += "\n\n![left|caption](" + data.url + ")\n\n";
        status.textContent = "Inserted " + data.url;
      } catch (e) {
        status.textContent = "Upload failed.";
      }
    });
  }

  // Confirm dialogs for destructive actions (forms with data-confirm).
  var forms = document.querySelectorAll("form[data-confirm]");
  Array.prototype.forEach.call(forms, function (form) {
    form.addEventListener("submit", function (e) {
      if (!window.confirm(form.getAttribute("data-confirm"))) {
        e.preventDefault();
      }
    });
  });
})();
