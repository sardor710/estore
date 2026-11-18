import type { LegalContent } from './types'

const uz: LegalContent = {
  labels: {
    updated: 'Soʻnggi yangilanish',
    sellerFallback: 'zanko.uz internet-doʻkoni',
    contactsTitle: 'Sotuvchi rekvizitlari va aloqa',
    name: 'Sotuvchi',
    inn: 'STIR (INN)',
    address: 'Manzil',
    phone: 'Telefon',
    email: 'Elektron pochta',
    telegram: 'Telegram',
    hours: 'Ish vaqti',
    notSet: 'Biz bilan {bot} Telegram-boti orqali bogʻlaning.',
    footer: 'Maʼlumot',
    short: { offer: 'Ommaviy oferta', privacy: 'Maxfiylik siyosati', warranty: 'Kafolat va qaytarish' },
  },

  offer: {
    title: 'Ommaviy oferta shartnomasi',
    description: '{site} internet-doʻkonida tovarlarni sotish shartlari: buyurtma berish, narxlar, yetkazib berish, toʻlov, kafolat va qaytarish.',
    sections: [
      {
        h: '1. Umumiy qoidalar',
        blocks: [
          '1.1. Ushbu hujjat {seller} (keyingi oʻrinlarda — «Sotuvchi») tomonidan har qanday muomalaga layoqatli jismoniy shaxs (keyingi oʻrinlarda — «Xaridor») bilan {site} sayti va {bot} Telegram-boti (birgalikda — «Doʻkon») orqali tovarlarni masofadan turib chakana oldi-sotdi shartnomasini tuzish haqidagi rasmiy ommaviy ofertadir.',
          '1.2. Doʻkonda (saytda yoki Telegram-botda) buyurtma berish ushbu ofertani toʻliq va soʻzsiz qabul qilish (aksept) hisoblanadi. Shartnoma Sotuvchi buyurtmani telefon yoki xabar orqali tasdiqlagan paytdan boshlab tuzilgan hisoblanadi.',
          '1.3. Tomonlar oʻrtasidagi munosabatlar Oʻzbekiston Respublikasi Fuqarolik kodeksi, «Isteʼmolchilarning huquqlarini himoya qilish toʻgʻrisida»gi Qonun, «Elektron tijorat toʻgʻrisida»gi Qonun va Oʻzbekiston Respublikasining boshqa qonun hujjatlari bilan tartibga solinadi. Agar ofertaning biror sharti isteʼmolchilar huquqlarini himoya qilish boʻyicha majburiy normalarga zid boʻlsa, qonun normalari qoʻllaniladi.',
          '1.4. Sotuvchi ofertani oʻzgartirishi mumkin. Buyurtmaga uni berish paytida Doʻkonda eʼlon qilingan tahrir qoʻllaniladi.',
        ],
      },
      {
        h: '2. Tovarlar va narxlar',
        blocks: [
          '2.1. Doʻkondagi tovarlarning tavsiflari, rasmlari va xususiyatlari maʼlumot uchun berilgan. Ekran sozlamalari sababli tovar rangi rasmdan biroz farq qilishi mumkin; ishlab chiqaruvchi asosiy xususiyatlarni saqlagan holda qadoq va dizaynni oldindan xabar bermasdan oʻzgartirishi mumkin.',
          '2.2. Narxlar oʻzbek soʻmida (UZS) koʻrsatilgan. Buyurtma berilgan paytda Doʻkonda koʻrsatilgan narx amal qiladi. Aksiya narxlari aksiya davomida va tovar mavjud boʻlguncha amal qiladi.',
          '2.3. Agar buyurtma berilgandan keyin tovar mavjud emasligi yoki narx aniq xato bilan koʻrsatilgani maʼlum boʻlsa, Sotuvchi bu haqda Xaridorga xabar beradi, Xaridor esa almashtirishga rozi boʻlishi yoki buyurtmani bekor qilishi mumkin. Bu holda toʻlov olinmaydi.',
        ],
      },
      {
        h: '3. Buyurtma berish va tasdiqlash',
        blocks: [
          '3.1. Xaridor ismi, telefon raqami va yetkazib berish manzilini koʻrsatadi va ularning toʻgʻriligi uchun javobgar boʻladi.',
          '3.2. Buyurtma berilgandan soʻng Sotuvchi buyurtma tarkibi, narxi va yetkazib berish muddatini tasdiqlash uchun Xaridor bilan bogʻlanadi.',
          '3.3. Agar tasdiqlash uchun Xaridor bilan bogʻlanib boʻlmasa yoki notoʻgʻri maʼlumotlar koʻrsatilgan boʻlsa, Sotuvchi buyurtmani bekor qilishi mumkin.',
          '3.4. Xaridor buyurtmani topshirilgunga qadar istalgan vaqtda bepul bekor qilishi mumkin: telefon orqali, Telegram-botda yoki saytdagi shaxsiy kabinetda.',
        ],
      },
      {
        h: '4. Yetkazib berish va qabul qilish',
        blocks: [
          '4.1. Sotuvchi tovarlarni butun Oʻzbekiston Respublikasi boʻylab yetkazib beradi. Agar buyurtmada boshqacha koʻrsatilmagan boʻlsa, yetkazib berish bepul. Yetkazib berish muddati buyurtmani tasdiqlashda kelishiladi.',
          '4.2. Qabul qilishda Xaridor (yoki uning vakili) kuryer ishtirokida tovarning soni, butligi, tashqi koʻrinishi va qadoqning butunligini tekshiradi. Xaridor koʻrinib turgan shikastli, toʻliq boʻlmagan yoki boshqa tovardan voz kechishi mumkin — u bepul almashtiriladi.',
          '4.3. Tovarga boʻlgan mulk huquqi va uning tasodifan nobud boʻlishi yoki shikastlanishi xavfi tovar topshirilgan va toʻlangan paytdan Xaridorga oʻtadi.',
        ],
      },
      {
        h: '5. Toʻlov',
        blocks: [
          '5.1. Xaridor tovar uchun uni qabul qilishda naqd pul bilan yoki Sotuvchi buyurtmani tasdiqlashda taklif qilgan boshqa usulda toʻlaydi.',
          '5.2. Sotuvchi Oʻzbekiston Respublikasi qonun hujjatlarida belgilangan tartibda chek beradi.',
        ],
      },
      {
        h: '6. Kafolat va qaytarish',
        blocks: ['6.1. Kafolat, tovarni almashtirish va qaytarish shartlari ushbu ofertaning ajralmas qismi boʻlgan [Kafolat va qaytarish](/legal/warranty) boʻlimida bayon etilgan.'],
      },
      {
        h: '7. Javobgarlik',
        blocks: [
          '7.1. Sotuvchi tovardan ishlab chiqaruvchi yoʻriqnomasini buzgan holda foydalanish natijasida yetkazilgan zarar, shuningdek Xaridor notoʻgʻri maʼlumot koʻrsatgani sababli yuzaga kelgan kechikishlar uchun javobgar emas.',
          '7.2. Tomonlar yengib boʻlmaydigan kuch holatlari (tabiiy ofatlar, davlat organlarining harakatlari, aloqa tarmoqlaridagi uzilishlar va tomonlarga bogʻliq boʻlmagan boshqa holatlar) sababli majburiyatlarni bajarmaganlik uchun javobgarlikdan ozod qilinadi.',
        ],
      },
      {
        h: '8. Shaxsga doir maʼlumotlar',
        blocks: ['8.1. Buyurtma berish orqali Xaridor shaxsga doir maʼlumotlarini [Maxfiylik siyosati](/legal/privacy)ga muvofiq qayta ishlashga rozilik beradi.'],
      },
      {
        h: '9. Daʼvolar va nizolar',
        blocks: [
          '9.1. Xaridor daʼvoni telefon orqali, Telegram-botda yoki Sotuvchining manziliga yozma ravishda yuborishi mumkin. Sotuvchi daʼvolarni isteʼmolchilar huquqlarini himoya qilish toʻgʻrisidagi qonun hujjatlarida belgilangan muddatlarda koʻrib chiqadi.',
          '9.2. Nizolar muzokaralar yoʻli bilan hal etiladi. Kelishuvga erishilmasa, nizo Oʻzbekiston Respublikasi qonun hujjatlariga muvofiq sudda koʻrib chiqiladi. Xaridor isteʼmolchilar huquqlarini himoya qilish organlariga ham murojaat qilishi mumkin.',
        ],
      },
      { h: '10. Sotuvchi rekvizitlari', blocks: [{ contacts: true }] },
    ],
  },

  privacy: {
    title: 'Maxfiylik siyosati',
    description: '{site} internet-doʻkoni qanday shaxsga doir maʼlumotlarni yigʻadi, nima uchun, kimga beradi va ularni qanday boshqarish mumkin.',
    sections: [
      {
        h: '1. Umumiy qoidalar',
        blocks: [
          '1.1. Ushbu siyosat {seller} (keyingi oʻrinlarda — «biz») {site} sayti va {bot} Telegram-boti foydalanuvchilarining shaxsga doir maʼlumotlarini Oʻzbekiston Respublikasining «Shaxsga doir maʼlumotlar toʻgʻrisida»gi Qonuniga muvofiq qanday qayta ishlashini tushuntiradi.',
          '1.2. Buyurtma berish, akkauntga kirish yoki Doʻkondan boshqa yoʻl bilan foydalanish orqali siz shaxsga doir maʼlumotlaringizni ushbu siyosat shartlarida qayta ishlashga rozilik bildirasiz.',
        ],
      },
      {
        h: '2. Qanday maʼlumotlarni yigʻamiz',
        blocks: [
          {
            ul: [
              'Buyurtma maʼlumotlari: ism, telefon raqami, viloyat, yetkazib berish manzili, buyurtmaga izoh va, agar ulashishni tanlasangiz, kuryer uchun xaritadagi nuqta.',
              'Bot orqali kirishda Telegram akkaunti maʼlumotlari: Telegram ID, ism va familiya, username, Telegramda ulashgan telefon raqamingiz, til va bildirishnoma sozlamalari.',
              'Buyurtmalar tarixi, saqlangan manzillar, sevimlilar va Doʻkonda sizga yuboradigan xabarlarimiz.',
              'Texnik maʼlumotlar: akkauntda qolishingiz uchun kirish cookie fayli; cookiesiz yigʻiladigan anonim tashriflar statistikasi (har kuni oʻzgaradigan identifikator ishlatiladi, statistikada IP-manzillar saqlanmaydi); xavfsizlik uchun qisqa muddat saqlanadigan IP-manzil va brauzer turi yozilgan server jurnallari.',
            ],
          },
          'Savatchangiz oʻz brauzeringizda saqlanadi. Bank kartalari maʼlumotlarini yigʻmaymiz.',
        ],
      },
      {
        h: '3. Ulardan nima uchun foydalanamiz',
        blocks: [
          {
            ul: [
              'buyurtmalarni qabul qilish, tasdiqlash, yetkazib berish va ular boʻyicha siz bilan bogʻlanish uchun;',
              'kafolat xizmati, tovarlarni almashtirish va qaytarish uchun;',
              'shaxsiy kabinet ishlashi va Telegramda buyurtma holati haqida bildirishnomalar uchun;',
              'Telegramda Doʻkon yangiliklari va takliflarini yuborish uchun — buni botdagi /notifications buyrugʻi bilan istalgan vaqtda oʻchirib qoʻyish mumkin;',
              'Doʻkonni suiisteʼmol va firibgarlikdan himoya qilish uchun;',
              'soliq, buxgalteriya va boshqa qonun hujjatlari talablarini bajarish uchun.',
            ],
          },
        ],
      },
      {
        h: '4. Ularni kimga beramiz',
        blocks: [
          {
            ul: [
              'Kuryerlar va yetkazib berish xizmatlariga — faqat buyurtmani yetkazish uchun zarur boʻlgan ism, telefon va manzil.',
              'Telegramga — bot xabarlari Telegram orqali yetkaziladi, u maʼlumotlarni oʻz maxfiylik siyosatiga muvofiq qayta ishlaydi.',
              'Doʻkon maʼlumotlarini bizning topshirigʻimiz bilan saqlaydigan xosting provayderimizga.',
              'Davlat organlariga — qonunda nazarda tutilgan hollarda.',
            ],
          },
          'Biz shaxsga doir maʼlumotlarni sotmaymiz va reklama trekerlaridan foydalanmaymiz.',
        ],
      },
      {
        h: '5. Ularni qancha muddat saqlaymiz',
        blocks: [
          '5.1. Akkaunt maʼlumotlari akkaunt oʻchirilgunga qadar saqlanadi. Buyurtma maʼlumotlari soliq va buxgalteriya qonunchiligida belgilangan muddat davomida hamda kafolat muddatida saqlanadi. Server jurnallari bir necha hafta saqlanadi.',
          '5.2. Saqlash muddati tugagach yoki qayta ishlash maqsadiga erishilgach, maʼlumotlar oʻchiriladi yoki anonimlashtiriladi.',
        ],
      },
      {
        h: '6. Sizning huquqlaringiz',
        blocks: [
          {
            ul: [
              'qaysi maʼlumotlaringizni qayta ishlayotganimizni bilish va ularning nusxasini olish;',
              'notoʻgʻri maʼlumotlarni tuzatish (ularning aksariyatini shaxsiy kabinetda oʻzgartirish mumkin);',
              'roziligingizni qaytarib olish va akkauntni oʻchirish — saytdagi shaxsiy kabinetda (Profil) yoki bizga murojaat qilib;',
              'Telegram-botda yangiliklar va takliflarni oʻchirib qoʻyish (/notifications);',
              'shaxsga doir maʼlumotlar sohasidagi vakolatli davlat organiga yoki sudga shikoyat qilish.',
            ],
          },
        ],
      },
      {
        h: '7. Xavfsizlik',
        blocks: [
          '7.1. Doʻkon faqat himoyalangan HTTPS ulanishi orqali ishlaydi. Shaxsga doir maʼlumotlarga faqat buyurtmalarni qayta ishlash uchun zarur boʻlgan xodimlar kira oladi; xodimlarning parollari shifrlangan (xeshlangan) holda saqlanadi; muntazam ravishda zaxira nusxalar yaratiladi.',
        ],
      },
      {
        h: '8. Voyaga yetmaganlar',
        blocks: ['8.1. Doʻkon voyaga yetganlar uchun moʻljallangan. 18 yoshga toʻlmagan shaxslar buyurtmani faqat ota-onalari yoki qonuniy vakillarining roziligi bilan berishlari mumkin.'],
      },
      {
        h: '9. Oʻzgarishlar va aloqa',
        blocks: [
          '9.1. Biz ushbu siyosatni yangilashimiz mumkin; amaldagi tahriri har doim soʻnggi yangilanish sanasi bilan ushbu sahifada eʼlon qilinadi.',
          '9.2. Shaxsga doir maʼlumotlar boʻyicha savollar uchun biz bilan bogʻlaning:',
          { contacts: true },
        ],
      },
    ],
  },

  warranty: {
    title: 'Kafolat va qaytarish',
    description: 'Barcha tovarlarga 1 yil, kabellarga 2 yil kafolat, yangi tovarga almashtirish va 14 kun ichida qaytarish.',
    sections: [
      {
        h: '1. Kafolat muddati',
        blocks: [
          {
            ul: [
              '12 oy — zaryadlovchi qurilmalar, pauerbanklar, audio va boshqa barcha tovarlar;',
              '24 oy — kabellar.',
            ],
          },
          'Kafolat muddati tovarni qabul qilgan kundan boshlanadi. Buyurtma raqami (u shaxsiy kabinetda va Telegram-botda bor) yoki chek xaridni tasdiqlaydi.',
        ],
      },
      {
        h: '2. Tovar nosoz boʻlsa nima qilamiz',
        blocks: [
          'Agar kafolat muddati davomida kafolat qamrab oladigan nosozlik paydo boʻlsa, biz tovarni xuddi shunday yangisiga almashtiramiz. Agar bu model endi sotuvda boʻlmasa, sizning tanlovingizga koʻra teng qiymatli model taklif qilamiz yoki uning narxini qaytaramiz.',
          'Almashtirib berilgan tovarning kafolat muddati almashtirilgan kundan boshlab qaytadan hisoblanadi. Kafolat boʻyicha almashtirishda yetkazib berish xarajatlarini biz oʻz zimmamizga olamiz.',
          'Ushbu kafolat isteʼmolchilar huquqlarini himoya qilish toʻgʻrisidagi qonun hujjatlari boʻyicha boshqa huquqlaringizni cheklamaydi.',
        ],
      },
      {
        h: '3. Kafolat nimalarni qamrab oladi',
        blocks: [
          'Ishlab chiqaruvchi yoʻriqnomasiga muvofiq oddiy foydalanishda quyidagilardan biri yuz bersa, tovar almashtiriladi:',
          'Zaryadlovchi qurilmalar (tarmoq, avtomobil, simsiz, GaN):',
          {
            ul: [
              'yoqilmaydi yoki mos qurilmani zaryadlamaydi;',
              'bir yoki bir nechta port ishlamaydi;',
              'mos kabel va qurilma bilan chiqish quvvati yoki tez zaryadlash (PD, QC, PPS) koʻrsatilganidan sezilarli darajada past;',
              'oddiy foydalanishda haddan tashqari qiziydi, oʻchib qoladi yoki qayta yoqiladi;',
              'displey, indikator yoki yigʻiladigan vilka ishlamaydi;',
              'kuchli gʻuvillaydi yoki kuygan hid chiqaradi (foydalanishni toʻxtating va biz bilan bogʻlaning).',
            ],
          },
          'Pauerbanklar:',
          {
            ul: [
              'oʻzi zaryadlanmaydi yoki qurilmalarni zaryadlamaydi;',
              'zaryadni ushlab turmaydi yoki foydalanilmaganda tez zaryadsizlanadi;',
              'sigʻimi ushbu model uchun odatdagidan ancha past;',
              'akkumulyator shishgan yoki oqib chiqqan (darhol foydalanishni toʻxtating va biz bilan bogʻlaning);',
              'portlar, tugmalar, indikator, displey, simsiz zaryadlash maydonchasi yoki ichki kabellar ishlamaydi.',
            ],
          },
          'Kabellar:',
          {
            ul: [
              'zaryadlamaydi yoki maʼlumot uzatmaydi;',
              'koʻrinadigan shikastsiz ulanish uzilib qoladi yoki faqat maʼlum burchakda ishlaydi;',
              'xususiyatlarida koʻrsatilgan tez zaryadlash, maʼlumot uzatish tezligi yoki video chiqishini qoʻllab-quvvatlamaydi;',
              'oddiy foydalanishda razyom boʻshab qolgan yoki razyom ichidagi simlar uzilgan.',
            ],
          },
          'Boshqa aksessuarlar (quloqchinlar, kolonkalar, hablar va adapterlar, ushlagichlar va tagliklar, soat va telefon aksessuarlari):',
          {
            ul: [
              'yoqilmaydi, zaryadlanmaydi yoki Bluetooth orqali ulanmaydi;',
              'bir yoki ikkala kanalda ovoz yoʻq yoki buzilgan, mikrofon ishlamaydi;',
              'akkumulyator ishlab chiqaruvchi koʻrsatgan vaqtdan ancha kam ishlaydi;',
              'tugmalar, sensorli boshqaruv, portlar yoki indikatorlar ishlamaydi;',
              'hab yoki adapterning porti yoki funksiyasi ishlamaydi;',
              'oddiy foydalanishda ushlagich yoki taglikning mexanizmi, sharniri yoki magnitlari sinib qolgan.',
            ],
          },
        ],
      },
      {
        h: '4. Kafolat nimalarni qamrab olmaydi',
        blocks: [
          {
            ul: [
              'mexanik shikastlar: yoriqlar, botiqlar, egilgan yoki singan razyomlar, kesilgan, gʻajilgan, ezilgan yoki qattiq bukilgan kabel, uy hayvonlari tishlagan joylar;',
              'suyuqlik, namlik tushishi, korroziya;',
              'olov, kuchli issiqlik yoki sovuqdan shikastlanish;',
              'nosoz yoki nostandart quvvat manbai bilan foydalanish, kuchlanish sakrashlari, ishlab chiqaruvchi yoʻriqnomasiga zid foydalanish;',
              'tovar biz tomonimizdan emas, boshqa shaxs tomonidan ochilgan, taʼmirlangan yoki oʻzgartirilgan, seriya yorliqlari shikastlangan yoki olib tashlangan;',
              'tabiiy eskirish va kosmetik oʻzgarishlar: tirnalishlar, rangning oqarishi, quloqchin yostiqchalarining eskirishi; vaqt oʻtishi bilan akkumulyator sigʻimining tabiiy, asta-sekin kamayishi;',
              'mayda butlovchi qismlar va sarf materiallari: quloqchin yostiqchalari, gʻiloflar, qadoq;',
              'qoʻllab-quvvatlanadigan deb koʻrsatilmagan qurilma bilan mos kelmaslik yoki oʻz qurilmangiz dasturiy taʼminoti sababli muammolar;',
              'yoʻqotish yoki oʻgʻirlik, shuningdek bizning Doʻkonimizdan sotib olinmagan tovarlar.',
            ],
          },
        ],
      },
      {
        h: '5. Kafolat boʻyicha qanday murojaat qilish kerak',
        blocks: [
          {
            ul: [
              'Biz bilan Telegram-bot yoki telefon orqali bogʻlaning, buyurtma raqamini ayting va muammoni tasvirlab bering.',
              'Tovarni barcha butlovchi qismlari bilan (iloji boʻlsa, asl qutisida) bizga topshiring yoki yuboring.',
              'Biz tovarni odatda 1–3 ish kuni ichida tekshiramiz; uzoqroq texnik tekshiruv zarur boʻlsa — qonunda belgilangan muddatlarda.',
              'Agar nosozlik kafolatga kirsa, siz yangi tovar olasiz.',
            ],
          },
        ],
      },
      {
        h: '6. 14 kun ichida qaytarish',
        blocks: [
          'Sifatli tovarni qabul qilgan kundan boshlab 14 kun ichida qaytarishingiz mumkin, agar:',
          {
            ul: [
              'quti ochilmagan: zavod plombasi yoki muhr-stikeri butun;',
              'tovar ishlatilmagan va tovar koʻrinishini, toʻliq butligini, yorliqlari va asl qadogʻini saqlagan;',
              'sizda buyurtma raqami yoki chek bor.',
            ],
          },
          'Tovarni qabul qilib, tekshirganimizdan soʻng 10 kun ichida uning toʻliq narxini naqd pulda yoki bank kartangizga oʻtkazma orqali qaytaramiz. Sifatli tovarni qaytarish sizning hisobingizdan amalga oshiriladi; biz kuryerimiz orqali olib ketishni tashkil qilishimiz mumkin. Pul qaytarish oʻrniga tovarni boshqasiga almashtirish mumkin.',
          'Plombasi ochilgan tovarni faqat fikringiz oʻzgargani sababli qaytarib boʻlmaydi. Agar u nosoz boʻlsa, kafolat boʻyicha almashtiriladi.',
        ],
      },
      {
        h: '7. Qabul qilishdagi muammolar',
        blocks: [
          'Buyurtmani kuryer topshirayotganda tekshiring. Agar boshqa tovar keltirilgan boʻlsa, biror narsa yetishmasa yoki tovar yoxud qadoq shikastlangan boʻlsa, undan joyida toʻlovsiz voz kechishingiz yoki 24 soat ichida bizga xabar berishingiz mumkin — tovarni bepul almashtiramiz.',
        ],
      },
      { h: '8. Aloqa', blocks: [{ contacts: true }] },
    ],
  },
}

export default uz
