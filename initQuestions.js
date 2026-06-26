// initQuestions.js
// Lisää kaikki visakysymykset MongoDB Atlasiin
// Ajo: node initQuestions.js
// Idempotentti: poistaa vanhat ja lisää uudet joka ajolla

require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/question');

const QUESTIONS = [
  {
    type: 'osaekomi',
    category: 'Osaekomi-Waza',
    jpName: '抑込技',
    questionText: 'Kerro kuusi sidontaa (Osaekomi-Waza)',
    attempts: 6,
    answers: [
      'kesa gatame',
      'hon kesa gatame',
      'kuzure kesa gatame',
      'makura kesa gatame',
      'ushiro kesa gatame',
      'kata gatame',
      'kami shiho gatame',
      'kuzure kami shiho gatame',
      'yoko shiho gatame',
      'tate shiho gatame',
      'uki gatame',
      'ura gatame',
    ],
  },
  {
    type: 'shimewaza',
    category: 'Shime-Waza',
    jpName: '絞技',
    questionText: 'Kerro kuusi kuristusta (Shime-Waza)',
    attempts: 6,
    answers: [
      'nami juji jime',
      'gyaku juji jime',
      'kata juji jime',
      'hadaka jime',
      'okuri eri jime',
      'kataha jime',
      'katate jime',
      'ryote jime',
      'sode guruma jime',
      'tsukkomi jime',
      'sankaku jime',
      'do jime',
      'koshi jime',
    ],
  },
  {
    type: 'kansetsuwaza',
    category: 'Kansetsu-Waza',
    jpName: '関節技',
    questionText: 'Kerro kuusi nivellukkoa (Kansetsu-Waza)',
    attempts: 6,
    answers: [
      'ude garami',
      'ude hishigi juji gatame',
      'ude hishigi ude gatame',
      'ude hishigi hiza gatame',
      'ude hishigi waki gatame',
      'ude hishigi hara gatame',
      'ude hishigi ashi gatame',
      'ude hishigi te gatame',
      'ude hishigi sankaku gatame',
      'ashi garami',
      'juji gatame',
      'hiza gatame',
      'waki gatame',
      'te gatame',
      'sankaku gatame',
      'hara gatame',
      'ashi gatame',
      'ude gatame',
    ],
  },
  {
    type: 'tewaza',
    category: 'Te-Waza',
    jpName: '手技',
    questionText: 'Kerro kuusi käsiheittoa (Te-Waza)',
    attempts: 6,
    answers: [
      'seoi nage',
      'ippon seoi nage',
      'eri seoi nage',
      'morote seoi nage',
      'seoi otoshi',
      'tai otoshi',
      'kata guruma',
      'sukui nage',
      'obi otoshi',
      'uki otoshi',
      'sumi otoshi',
      'yama arashi',
      'obi tori gaeshi',
      'morote gari',
      'kuchiki taoshi',
      'kibisu gaeshi',
      'uchi mata sukashi',
      'ko uchi gaeshi',
    ],
  },
  {
    type: 'koshiwaza',
    category: 'Koshi-Waza',
    jpName: '腰技',
    questionText: 'Kerro kuusi lonkkaheittoa (Koshi-Waza)',
    attempts: 6,
    answers: [
      'uki goshi',
      'o goshi',
      'koshi guruma',
      'tsuri komi goshi',
      'sode tsuri komi goshi',
      'harai goshi',
      'tsuri goshi',
      'hane goshi',
      'utsuri goshi',
      'ushiro goshi',
    ],
  },
  {
    type: 'masutemiwaza',
    category: 'Ma-Sutemi-Waza',
    jpName: '真捨身技',
    questionText: 'Kerro neljä selälleen tehtävää uhrautumisheittoa (Ma-Sutemi-Waza)',
    attempts: 4,
    answers: [
      'tomoe nage',
      'sumi gaeshi',
      'hikikomi gaeshi',
      'tawara gaeshi',
      'ura nage',
    ],
  },
  {
    type: 'yokosutemiwaza',
    category: 'Yoko-Sutemi-Waza',
    jpName: '横捨身技',
    questionText: 'Kerro kuusi kyljelleen tehtävää uhrautumisheittoa (Yoko-Sutemi-Waza)',
    attempts: 6,
    answers: [
      'yoko otoshi',
      'tani otoshi',
      'hane makikomi',
      'soto makikomi',
      'uchi makikomi',
      'uki waza',
      'yoko wakare',
      'yoko guruma',
      'yoko gake',
      'daki wakare',
      'o soto makikomi',
      'uchi mata makikomi',
      'harai makikomi',
      'ko uchi makikomi',
      'kani basami',
      'kawazu gake',
    ],
  },
];

(async () => {
  try {
    console.log('🔌 Yhdistetään MongoDB Atlasiin...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Yhdistetty!\n');

    let lisatty = 0;
    let paivitetty = 0;

    for (const q of QUESTIONS) {
      // Poista vanha saman tyypin dokumentti
      const existing = await Question.findOne({ type: q.type });

      if (existing) {
        await Question.findOneAndReplace({ type: q.type }, q, { runValidators: true });
        console.log(`🔄 Päivitetty:  ${q.category} (${q.answers.length} vastausta, ${q.attempts} yritystä)`);
        paivitetty++;
      } else {
        await Question.create(q);
        console.log(`✅ Lisätty:     ${q.category} (${q.answers.length} vastausta, ${q.attempts} yritystä)`);
        lisatty++;
      }
    }

    console.log(`
========================================
  Valmis!
  Lisätty:    ${lisatty} kategoriaa
  Päivitetty: ${paivitetty} kategoriaa
  Yhteensä:   ${QUESTIONS.length} kategoriaa Atlasissa
========================================
    `);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Virhe:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
})();
