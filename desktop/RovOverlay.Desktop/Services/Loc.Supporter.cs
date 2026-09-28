namespace RovOverlay.Desktop.Services;

// Supporter keys (docs/PLAN.md §10): the Settings section, the expiry reminder and the
// line saying the app is not Garena's or Tencent's.
public sealed partial class Loc
{
    private static readonly Dictionary<string, string> SupporterEn = new()
    {
        ["Supporter.Section"] = "SUPPORTER",
        ["Supporter.Hint"] = "The app is free and stays free. Supporters help keep it going, and their key hides the small \"ROV Overlay Tool\" watermark on every overlay. The key is checked on this PC: no account, and no internet needed during a broadcast.",
        ["Supporter.None"] = "No supporter key. The overlays show a small watermark.",
        ["Supporter.Active"] = "Supporter: {0}, until {1}. No watermark on the overlays.",
        ["Supporter.ActiveSoon"] = "Supporter: {0}, until {1}. Runs out in {2} days.",
        ["Supporter.Expired"] = "The key for {0} ran out on {1}. The watermark is back.",
        ["Supporter.Revoked"] = "The key for {0} has been switched off. The watermark is back.",
        ["Supporter.Broken"] = "The saved key is not valid any more. The watermark is back.",
        ["Supporter.Offline"] = "Waiting for the server…",
        ["Supporter.Paste"] = "Paste your key here (starts with RVS1-)",
        ["Supporter.Use"] = "Use this key",
        ["Supporter.Remove"] = "Remove key",
        ["Supporter.Become"] = "Become a supporter",
        ["Supporter.Thanks"] = "Thank you, {0}! The watermark is gone from every overlay.",
        ["Supporter.RemoveTitle"] = "Remove the supporter key?",
        ["Supporter.RemoveBody"] = "The watermark comes back on every overlay straight away, including any that are on air.",
        ["Supporter.RemoveBody2"] = "Keep a copy of the key if you want to use it again.",
        ["Supporter.Removed"] = "Supporter key removed.",
        ["Supporter.Err.format"] = "That is not a supporter key. Copy the whole key, starting with RVS1-.",
        ["Supporter.Err.signature"] = "That key was not made by ROV Overlay Tool. Check it was copied completely.",
        ["Supporter.Err.expired"] = "That key has run out.",
        ["Supporter.Err.revoked"] = "That key has been switched off.",
        ["Supporter.RemindSoon"] = "Your supporter key runs out in {0} days ({1}). After that the watermark comes back.",
        ["Supporter.RemindExpired"] = "Your supporter key ran out on {0}. The watermark is back on the overlays.",
        ["Settings.Disclaimer"] = "ROV Overlay Tool is a fan-made tool. It is not endorsed by Garena or Tencent and does not reflect the views of anyone officially involved in producing or managing Arena of Valor (RoV). Game names, hero images and logos belong to their owners."
    };

    private static readonly Dictionary<string, string> SupporterTh = new()
    {
        ["Supporter.Section"] = "ผู้สนับสนุน",
        ["Supporter.Hint"] = "แอปนี้ใช้ฟรีและจะฟรีต่อไป ผู้สนับสนุนช่วยให้แอปไปต่อได้ และคีย์ของผู้สนับสนุนจะซ่อนลายน้ำ \"ROV Overlay Tool\" เล็ก ๆ บนทุก overlay คีย์ตรวจในเครื่องนี้เอง ไม่ต้องมีบัญชี และไม่ต้องใช้อินเทอร์เน็ตระหว่างถ่ายทอด",
        ["Supporter.None"] = "ยังไม่มีคีย์ผู้สนับสนุน overlay จะมีลายน้ำเล็ก ๆ",
        ["Supporter.Active"] = "ผู้สนับสนุน: {0} ถึง {1} ไม่มีลายน้ำบน overlay",
        ["Supporter.ActiveSoon"] = "ผู้สนับสนุน: {0} ถึง {1} เหลืออีก {2} วัน",
        ["Supporter.Expired"] = "คีย์ของ {0} หมดอายุเมื่อ {1} ลายน้ำกลับมาแล้ว",
        ["Supporter.Revoked"] = "คีย์ของ {0} ถูกปิดใช้งานแล้ว ลายน้ำกลับมาแล้ว",
        ["Supporter.Broken"] = "คีย์ที่บันทึกไว้ใช้ไม่ได้แล้ว ลายน้ำกลับมาแล้ว",
        ["Supporter.Offline"] = "กำลังรอเซิร์ฟเวอร์…",
        ["Supporter.Paste"] = "วางคีย์ที่นี่ (ขึ้นต้นด้วย RVS1-)",
        ["Supporter.Use"] = "ใช้คีย์นี้",
        ["Supporter.Remove"] = "ลบคีย์",
        ["Supporter.Become"] = "ร่วมเป็นผู้สนับสนุน",
        ["Supporter.Thanks"] = "ขอบคุณ {0}! ลายน้ำหายไปจากทุก overlay แล้ว",
        ["Supporter.RemoveTitle"] = "ลบคีย์ผู้สนับสนุน?",
        ["Supporter.RemoveBody"] = "ลายน้ำจะกลับมาบนทุก overlay ทันที รวมถึงอันที่กำลังออกอากาศอยู่",
        ["Supporter.RemoveBody2"] = "เก็บคีย์ไว้ถ้าจะใช้อีกครั้ง",
        ["Supporter.Removed"] = "ลบคีย์ผู้สนับสนุนแล้ว",
        ["Supporter.Err.format"] = "นี่ไม่ใช่คีย์ผู้สนับสนุน คัดลอกคีย์ให้ครบ ตั้งแต่ RVS1-",
        ["Supporter.Err.signature"] = "คีย์นี้ไม่ได้ออกโดย ROV Overlay Tool ตรวจว่าคัดลอกมาครบ",
        ["Supporter.Err.expired"] = "คีย์นี้หมดอายุแล้ว",
        ["Supporter.Err.revoked"] = "คีย์นี้ถูกปิดใช้งานแล้ว",
        ["Supporter.RemindSoon"] = "คีย์ผู้สนับสนุนของคุณจะหมดอายุในอีก {0} วัน ({1}) หลังจากนั้นลายน้ำจะกลับมา",
        ["Supporter.RemindExpired"] = "คีย์ผู้สนับสนุนของคุณหมดอายุเมื่อ {0} ลายน้ำกลับมาบน overlay แล้ว",
        ["Settings.Disclaimer"] = "ROV Overlay Tool เป็นเครื่องมือที่แฟนเกมทำขึ้นเอง ไม่ได้รับการรับรองจาก Garena หรือ Tencent และไม่ได้สะท้อนความเห็นของผู้ที่เกี่ยวข้องกับการผลิตหรือดูแล Arena of Valor (RoV) อย่างเป็นทางการ ชื่อเกม รูปฮีโร่ และโลโก้เป็นของเจ้าของสิทธิ์"
    };
}

// A key's last day, the way people write dates: "27 Oct 2026", or "27 ต.ค. 2569" in Thai,
// which counts years in the Buddhist era.
public static class SupporterDates
{
    public static string Show(string? isoDate)
    {
        if (!DateTime.TryParseExact(isoDate, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.None, out var date))
            return isoDate ?? "?";
        return date.ToString("d MMM yyyy", Loc.Instance.Culture);
    }
}
