try { document.documentElement.dataset.theme = localStorage.getItem('heukgaek-theme') || 'dark'; } catch (_) { /* storage may be unavailable */ }
