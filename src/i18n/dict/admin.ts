import type { Dict } from "../index";

export const admin: Dict = {
  tr: {
    tempPasswordTitle: "Geçici parola kullanıyorsunuz", tempPasswordBody: "Güvenliğiniz için parolanızı şimdi değiştirin.",
    accountInfo: "Hesap bilgileri", systemRole: "Sistem yetkisi", changePassword: "Parola değiştir",
    pwCurrent: "Mevcut parola", pwNew: "Yeni parola", pwAgain: "Yeni parola (tekrar)", pwHint: "En az 10 karakter.",
    pwTooShort: "Yeni parola en az 10 karakter olmalıdır.", pwMismatch: "Yeni parolalar eşleşmiyor.", pwWrong: "Mevcut parola hatalı.", pwChanged: "Parolanız güncellendi.",
  },
  en: {
    tempPasswordTitle: "You are using a temporary password", tempPasswordBody: "For your security, change your password now.",
    accountInfo: "Account details", systemRole: "System role", changePassword: "Change password",
    pwCurrent: "Current password", pwNew: "New password", pwAgain: "New password (again)", pwHint: "At least 10 characters.",
    pwTooShort: "The new password must be at least 10 characters.", pwMismatch: "The new passwords do not match.", pwWrong: "The current password is incorrect.", pwChanged: "Your password has been updated.",
  },
};
