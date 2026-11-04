// ==========================================================
//  config.js – deine Supabase-Verbindung
//  Wo du die zwei Werte findest: ANLEITUNG.md, Schritt 3.
// ==========================================================

window.PARTY_CONFIG = {
  // "Project URL", sieht so aus: https://abcdefghijklmnop.supabase.co
  supabaseUrl: "https://pcueftddhmsywosrhdpm.supabase.co",

  // "Publishable key" (beginnt mit sb_publishable_) oder der ältere "anon public" Key.
  // Der darf öffentlich sein – warum, steht in ANLEITUNG.md.
  supabaseKey: "sb_publishable_cN8reVtPT7yFtf0I1-Qufg_dapBVPs2",

  // E-Mail des gemeinsamen Gast-Kontos (Supabase → Authentication → Users).
  // Nur ändern, wenn du dort eine andere angelegt hast – dann auch in
  // supabase/setup.sql (Abschnitt 1) anpassen.
  guestEmail: "gast@example.com",
};
