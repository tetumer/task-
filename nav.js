fetch("/nav.html")
  .then(res => res.text())
  .then(html => {
    document.getElementById("navPlaceholder").innerHTML = html;

    const currentPath = window.location.pathname;
    document.querySelectorAll(".navLinks a").forEach(link => {
      if (link.dataset.path === currentPath) {
        link.classList.add("active");
      }
    });

    fetch("/wallet")
      .then(res => res.json())
      .then(wallet => {
        if (wallet.balance !== undefined) {
          document.getElementById("navWalletBalance").textContent = wallet.balance;
        }
      });

    document.getElementById("logoutBtn").addEventListener("click", () => {
      fetch("/logout", { method: "POST" })
        .then(() => window.location.href = "/login");
    });
  });