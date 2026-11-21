import type { Dict } from "../index";

export const tasks: Dict = {
  tr: {
    title: "Görevler", eyebrow: "Kişi bazlı görevler", selectPerson: "Kişi",
    duties: "Genel görev tanımı", orgTitle: "Kurumsal unvan", projectRole: "Proje görevi", workPlan: "Çalışma planı", province: "İl", period: "Görevlendirme dönemi",
    fixedRatio: "%{p} sabit oran", hourlyTotal: "{h} toplam", hourlyAvg: "{h}/ay ort.", unbudgeted: "Bütçesiz destek", unbudgetedSub: "0 € personel maliyeti",
    assignments: "Atanan alt faaliyetler", count: "{n} görev", allResp: "Tüm sorumluluklar", allWps: "Tüm iş paketleri",
    colSub: "Alt faaliyet", colResp: "Sorumluluk", colTask: "Kişiye özel iş", colPeriod: "Plan dönemi", colHours: "Plan süresi", colStatus: "Durum",
    none: "Bu süzgeçle görev bulunamadı.", noPerson: "Hesabınız bir kişi kartına bağlı değil.", noPersonBody: "Görev listesi için Admin hesabınızı bir ekip üyesiyle eşleştirmelidir.",
    openGantt: "Kişi takvimini aç", customPeriod: "Özel dönem",
  },
  en: {
    title: "Tasks", eyebrow: "Tasks per person", selectPerson: "Person",
    duties: "General duties", orgTitle: "Organisation title", projectRole: "Project role", workPlan: "Work plan", province: "Province", period: "Assignment period",
    fixedRatio: "{p}% fixed ratio", hourlyTotal: "{h} total", hourlyAvg: "{h}/month avg.", unbudgeted: "Unbudgeted support", unbudgetedSub: "€0 personnel cost",
    assignments: "Assigned sub-activities", count: "{n} tasks", allResp: "All responsibilities", allWps: "All work packages",
    colSub: "Sub-activity", colResp: "Responsibility", colTask: "Personal task", colPeriod: "Plan period", colHours: "Planned time", colStatus: "Status",
    none: "No tasks match this filter.", noPerson: "Your account is not linked to a person card.", noPersonBody: "The admin must link your account to a team member to list tasks.",
    openGantt: "Open personal calendar", customPeriod: "Custom period",
  },
};
