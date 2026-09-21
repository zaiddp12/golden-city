// يُحمَّل متزامناً في <head> قبل رسم أول بكسل. سياسة أمان المحتوى (CSP) في هذا
// النظام تمنع السكربت المضمّن، فكان لا بد أن يكون ملفاً مستقلاً من نفس الأصل.
// غرضه الوحيد: تثبيت الوضع قبل ظهور الصفحة، وإلا ومض الأبيض ثم انقلب داكناً.
try {
  var saved = localStorage.getItem('gc-theme');
  document.documentElement.dataset.theme = (saved === 'light' || saved === 'dark') ? saved : 'dark';
} catch (e) {
  document.documentElement.dataset.theme = 'dark';
}
