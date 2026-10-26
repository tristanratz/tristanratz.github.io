// Applies the theme before first paint to avoid a flash: the visitor's stored choice, else dark.
try {
  var t = localStorage.getItem("theme");
  document.documentElement.dataset.theme = t === "light" ? "light" : "dark";
} catch (e) {
  document.documentElement.dataset.theme = "dark";
}
