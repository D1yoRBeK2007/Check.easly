const { Bot, webhookCallback } = require("grammy");
const { createClient } = require("@supabase/supabase-js");

// Bularni o'z ma'lumotlaringiz bilan almashtirasiz
const bot = new Bot("8590338050:AAH5-osx-g1VpgtvcUogYJE5E7H2y-f8YSM");
const supabase = createClient(
    "https://hjwjomkywxnijfxnrwdt.supabase.co", 
    "sb_publishable_Xob1n96Fs5aqQlUZuhBbKA_eKn3jsuT"
);

// Start buyrug'i
bot.command("start", (ctx) => ctx.reply("Salom! Test topshirish uchun ilovani oching. \n\nUstozlar uchun: /new kod fan javoblar"));

// Yangi test yaratish (Faqat ustozlar uchun)
bot.command("new", async (ctx) => {
    try {
        const parts = ctx.message.text.split(" ");
        if (parts.length < 4) return ctx.reply("Xato! Namuna: /new 101 Tarix ABCD...");

        const [_, code, subject, answers] = parts;

        const { error } = await supabase.from('tests').insert([
            { code: code, subject: subject, answers: answers.toUpperCase(), is_active: true }
        ]);

        if (error) throw error;
        ctx.reply(`✅ Test yaratildi!\n📚 Fan: ${subject}\n🔑 Kod: ${code}`);
    } catch (err) {
        ctx.reply("Xatolik yuz berdi: " + err.message);
    }
});

// Vercel uchun eksport
module.exports = webhookCallback(bot, "http");
