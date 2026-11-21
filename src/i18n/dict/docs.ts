import type { Dict } from "../index";

export const docs: Dict = {
  tr: {
    lede: "Beş belge kategorisi. Türkçe asıl dosya ile İngilizce sürüm aynı belge kartında, dil etiketleriyle durur; yeni sürüm geçerli sürüm olur, eskiler saklanır.",
    upload: "Belge yükle", category: "Kategori", allCategories: "Tüm belgeler", access: "Erişim düzeyi", accessHint: "Mali erişimli belgeler yalnız mali yetkili ve Admin tarafından açılır.", accessHintTeam: "Kısıtlı belgeleri yalnız mali yetkili veya Admin oluşturabilir.",
    docDate: "Belge tarihi", typeHint: "Örn. sözleşme, rehber, tutanak", bilingualHint: "Türkçe veya İngilizce yazın; karşı dil otomatik üretilir.",
    fileTr: "Türkçe asıl dosya", fileEn: "İngilizce sürüm", fileRequired: "En az bir dosya seçin veya belge bağlantısı girin.",
    linkedRecord: "Bağlı kayıt", "link.meeting": "Toplantı", "link.travel": "Seyahat", "link.procurement": "Hizmet alımı", "link.payment": "Gelen ödeme", "link.work_log": "Çalışma kaydı",
    searchPlaceholder: "Başlık, açıklama veya tür", from: "Başlangıç", to: "Bitiş", activityCode: "Faaliyet kodu", clear: "Süzgeci temizle",
    empty: "Bu kategoride belge yok. Sağ üstteki düğmeyle ilk belgeyi yükleyin.",
    uploadedBy: "Yükleyen: {name}", currentVersion: "Geçerli sürüm",
    newVersion: "Yeni sürüm", newVersionHint: "Yeni dosya geçerli sürüm olarak işaretlenir. Önceki sürümler belge kartının sürüm geçmişinde kalır.", versionNote: "Sürüm notu",
    editCard: "Belge kartını düzenle", addLanguageVersion: "Bu sürüme dil sürümü ekle", history: "Sürüm geçmişi ({n})",
    confirmDelete: "Belge tüm sürümleriyle silinsin mi?", storedReportLocked: "Saklanan onaylı aylık raporu yalnız Admin silebilir.",
  },
  en: {
    lede: "Five document categories. The Turkish original and the English version sit on the same document card with language tags; a new version becomes the current one and earlier versions are kept.",
    upload: "Upload document", category: "Category", allCategories: "All documents", access: "Access level", accessHint: "Finance-access documents can only be opened by the finance officer and the admin.", accessHintTeam: "Only the finance officer or the admin can create restricted documents.",
    docDate: "Document date", typeHint: "E.g. contract, guide, minutes", bilingualHint: "Write in Turkish or English; the other language is generated automatically.",
    fileTr: "Turkish original file", fileEn: "English version", fileRequired: "Choose at least one file or enter a document link.",
    linkedRecord: "Linked record", "link.meeting": "Meeting", "link.travel": "Travel", "link.procurement": "Procurement", "link.payment": "Incoming payment", "link.work_log": "Work log",
    searchPlaceholder: "Title, description or type", from: "From", to: "To", activityCode: "Activity code", clear: "Clear filter",
    empty: "No documents in this category. Use the button at the top right to upload the first one.",
    uploadedBy: "Uploaded by {name}", currentVersion: "Current version",
    newVersion: "New version", newVersionHint: "The new file is marked as the current version. Earlier versions stay in the card's version history.", versionNote: "Version note",
    editCard: "Edit document card", addLanguageVersion: "Add a language version to this version", history: "Version history ({n})",
    confirmDelete: "Delete this document with all its versions?", storedReportLocked: "Only the admin can delete a stored approved monthly report.",
  },
};
