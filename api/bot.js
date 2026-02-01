const { Bot, webhookCallback } = require("grammy");
const { createClient } = require("@supabase/supabase-js");

// --- SIZ BERGAN MA'LUMOTLAR BILAN SOZLANMALAR ---
const BOT_TOKEN = "8590338050:AAH5-osx-g1VpgtvcUogYJE5E7H2y-f8YSM";
const SUPABASE_URL = "https://hjwjomkywxnijfxnrwdt.supabase.co"; // URL to'liq formatda
const SUPABASE_KEY = "sb_secret_edav3msggomPqyfNUuy9tA_f_rL_S89"; // Siz bergan kalit
const GROUP_ID = "-1003621378351"; // Natijalar boradigan guruh

// Bot va Bazani ulash
const bot = new Bot(BOT_TOKEN);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- 1. START: FOYDALANUVCHINI QABUL QILISH ---
bot.command("start", async (ctx) => {
    try {
        const { id, first_name, username } = ctx.from;
        
        // Bazaga yozish
        const { error } = await supabase.from('users').upsert({
            telegram_id: id,
            full_name: first_name,
            username: username || 'usernamesiz'
        }, { onConflict: 'telegram_id' });

        if (error) console.log("Start xatosi:", error.message);

        await ctx.reply(`Assalomu alaykum, ${first_name}! Test ishlash uchun pastdagi tugmani bosing:`, {
            reply_markup: {
                inline_keyboard: [[{ text: "🚀 Ilovani ochish", web_app: { url: "https://check-easly.vercel.app/" } }]]
            }
        });
    } catch (e) {
        console.error("Startda xatolik:", e);
    }
});

// --- 2. ADMIN: O'QITUVCHI TAYINLASH (/add_teacher ID LIMIT) ---
bot.command("add_teacher", async (ctx) => {
    try {
        // Admin ekanligini tekshirish
        const { data: user } = await supabase.from('users').select('role').eq('telegram_id', ctx.from.id).single();
        
        // O'zingizni (Adminni) ID raqamingizni aniq bilsangiz shu yerga qo'shib qo'yish mumkin
        if (user?.role !== '6045817037') return ctx.reply("❌ Siz admin emassiz.");

        const params = ctx.message.text.split(" ");
        if (params.length !== 3) return ctx.reply("Format: /add_teacher ID LIMIT\nMisol: /add_teacher 12345678 20");

        const targetId = params[1];
        const limit = parseInt(params[2]);

        const { error } = await supabase.from('users').update({ role: 'teacher', test_limit: limit }).eq('telegram_id', targetId);

        if (error) throw error;

        ctx.reply(`✅ O'qituvchi tayinlandi.\nID: ${targetId}\nLimit: ${limit}`);
        // Guruhga xabar
        await bot.api.sendMessage(GROUP_ID, `👨‍🏫 #Yangi_Ustoz\nID: ${targetId}\nLimit: ${limit}\nAdmin: ${ctx.from.first_name}`);
    } catch (e) {
        ctx.reply("❌ Xatolik: ID topilmadi yoki baza ruxsat bermadi.");
    }
});

// --- 3. NEW: YANGI TEST YARATISH (/new KOD FAN JAVOBLAR) ---
bot.command("new", async (ctx) => {
    try {
        const { data: user } = await supabase.from('users').select('*').eq('telegram_id', ctx.from.id).single();
        
        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) return ctx.reply("❌ Siz o'qituvchi emassiz.");
        if (user.role === 'teacher' && user.test_limit <= 0) return ctx.reply("⚠️ Limit tugagan! Admindan so'rang.");

        const params = ctx.message.text.split(" ");
        if (params.length < 4) return ctx.reply("Format: /new KOD FAN JAVOBLAR\nMisol: /new 101 Matemetika abcd");

        const code = params[1];
        const subject = params[2];
        const keys = params[3].toUpperCase();

        // 3 soatlik vaqtni belgilash
        const expiresAt = new Date(Date.now() + 3 * 60 * 60 * 1000); 

        // Avvalgi aktiv testni tekshirish
        const { data: active } = await supabase.from('tests').select('code').eq('code', code).gt('expires_at', new Date().toISOString()).single();
        if (active) return ctx.reply("⚠️ Bu kodli test hali ochiq (aktiv). Iltimos, boshqa kod ishlating.");

        const { error } = await supabase.from('tests').insert({
            code, subject, keys, teacher_id: ctx.from.id, expires_at: expiresAt
        });

        if (error) return ctx.reply("❌ Bu kod band. Boshqasini tanlang.");

        // Limitni ayirish
        if (user.role === 'teacher') {
            await supabase.from('users').update({ test_limit: user.test_limit - 1 }).eq('telegram_id', ctx.from.id);
        }

        ctx.reply(`✅ Test yaratildi!\nFan: ${subject}\nKod: ${code}\nYopiladi: 3 soatdan keyin.`);
        
        await bot.api.sendMessage(GROUP_ID, `📝 #Yangi_Test\nFan: ${subject}\nKod: ${code}\nUstoz: ${ctx.from.first_name}\nQolgan limit: ${user.test_limit - 1}`);

    } catch (e) {
        console.error("New test xatosi:", e);
        ctx.reply("❌ Tizim xatosi.");
    }
});

// --- 4. JAVOBLARNI TEKSHIRISH ---
bot.on(["message:web_app_data", "message:text"], async (ctx) => {
    try {
        let dataString = "";
        
        if (ctx.message.web_app_data) {
            dataString = ctx.message.web_app_data.data;
        } else if (ctx.message.text && ctx.message.text.includes("*")) {
            dataString = ctx.message.text;
        } else {
            return; 
        }

        // Format: KOD*JAVOBLAR*VAQT
        const parts = dataString.split("*");
        const code = parts[0];
        const userAnswers = parts[1];
        const duration = parts[2] ? parseInt(parts[2]) : 0; 

        const { data: test } = await supabase.from('tests').select('*').eq('code', code).single();

        if (!test) return ctx.reply("❌ Test topilmadi.");
        if (new Date() > new Date(test.expires_at)) return ctx.reply("⏰ Test vaqti tugagan.");

        // Bir marta ishlashni tekshirish
        const { data: exists } = await supabase.from('results').select('id').eq('user_id', ctx.from.id).eq('test_code', code).single();
        if (exists) return ctx.reply("⚠️ Siz bu testni topshirib bo'lgansiz.");

        let score = 0;
        let wrongs = [];
        const correctKeys = test.keys;

        for (let i = 0; i < correctKeys.length; i++) {
            if (userAnswers[i] && userAnswers[i].toUpperCase() === correctKeys[i]) {
                score++;
            } else {
                wrongs.push(i + 1);
            }
        }

        // Natijani yozish
        await supabase.from('results').insert({
            user_id: ctx.from.id,
            test_code: code,
            score: score,
            wrong_answers: wrongs.join(","),
            duration_seconds: duration
        });

        const msg = `📊 Natija: ${score} / ${correctKeys.length}\n⏱ Vaqt: ${Math.floor(duration/60)}m ${duration%60}s\n❌ Xatolar: ${wrongs.join(", ") || "Yo'q"}`;
        ctx.reply(msg);

    } catch (e) {
        console.error("Javob xatosi:", e);
        ctx.reply("❌ Xatolik.");
    }
});

// --- 5. STOP: REYTING JADVALI (/stop KOD) ---
bot.command("stop", async (ctx) => {
    try {
        const code = ctx.message.text.split(" ")[1];
        if (!code) return ctx.reply("Format: /stop KOD");

        const { data: test } = await supabase.from('tests').select('*').eq('code', code).single();
        if (!test) return ctx.reply("❌ Test topilmadi.");

        // Saralash: 1-Ball (kop), 2-Vaqt (kam)
        const { data: results } = await supabase.from('results')
            .select('score, duration_seconds, wrong_answers, users(full_name, username)')
            .eq('test_code', code)
            .order('score', { ascending: false })
            .order('duration_seconds', { ascending: true });

        if (!results || results.length === 0) return ctx.reply("Natijalar yo'q.");

        let report = `🏆 <b>TEST NATIJALARI</b>\nFan: ${test.subject} (Kod: ${code})\n\n`;
        let errMap = {};

        results.forEach((r, i) => {
            const name = r.users.username !== 'usernamesiz' ? `@${r.users.username}` : r.users.full_name;
            const time = `${Math.floor(r.duration_seconds/60)}m ${r.duration_seconds%60}s`;
            report += `${i + 1}. ${name} — <b>${r.score} ball</b> (${time})\n`;
            
            if(r.wrong_answers) {
                r.wrong_answers.split(",").forEach(n => { if(n) errMap[n] = (errMap[n]||0)+1; });
            }
        });

        const topErr = Object.entries(errMap).sort((a,b)=>b[1]-a[1]).slice(0,3);
        report += `\n📉 <b>Ko'p xato qilingan savollar:</b>\n`;
        topErr.forEach(e => report += `❓ ${e[0]}-savol: ${e[1]} ta xato.\n`);

        await ctx.reply(report, { parse_mode: "HTML" });
        await bot.api.sendMessage(GROUP_ID, report, { parse_mode: "HTML" });

    } catch (e) {
        console.error("Stop xatosi:", e);
        ctx.reply("❌ Hisobot xatosi.");
    }
});

// --- 6. SEND: REKLAMA YUBORISH ---
bot.command("send", async (ctx) => {
    try {
        const { data: user } = await supabase.from('users').select('role').eq('telegram_id', ctx.from.id).single();
        if (user?.role !== 'admin') return;

        const msg = ctx.message.text.replace("/send ", "");
        const { data: all } = await supabase.from('users').select('telegram_id');

        ctx.reply(`Xabar ${all.length} kishiga yuborilmoqda...`);
        
        for (const u of all) {
            await bot.api.sendMessage(u.telegram_id, msg).catch(()=>{});
            await new Promise(r => setTimeout(r, 50)); // Spamdan himoya
        }
        ctx.reply("✅ Yuborildi.");
    } catch (e) {
        ctx.reply("Xatolik.");
    }
});

module.exports = webhookCallback(bot, "http");
