const test = require('node:test');
const assert = require('node:assert');
const { Room, planPhases, validateQuestions } = require('../src/game');

const mkQuestions = (n) => Array.from({ length: n }, (_, i) => ({
  q: `Soal ${i + 1}`, options: ['a', 'b', 'c', 'd'], answer: i % 4,
}));

test('planPhases membagi semua soal ke 6 fase', () => {
  for (const total of [6, 7, 10, 20, 33, 100]) {
    const plan = planPhases(total);
    assert.strictEqual(plan.length, 6);
    assert.strictEqual(plan.reduce((s, p) => s + p.count, 0), total);
    assert.strictEqual(plan[5].end, total);
    assert.ok(plan.every((p) => p.count >= 1));
  }
  assert.deepStrictEqual(planPhases(20).map((p) => p.count), [3, 3, 3, 3, 4, 4]);
});

test('validateQuestions menolak data yang salah', () => {
  assert.ok(validateQuestions([]));
  assert.ok(validateQuestions(mkQuestions(5)));
  assert.strictEqual(validateQuestions(mkQuestions(6)), null);
  const bad = mkQuestions(6); bad[2].answer = 7;
  assert.match(validateQuestions(bad), /Soal 3/);
});

test('pemain: nama unik, batas 20, rejoin dengan token', () => {
  const room = new Room('ABCDE', { questions: mkQuestions(6) });
  const a = room.addPlayer({ name: 'Budi', charId: 'ksatria' });
  assert.ok(a.player);
  assert.ok(room.addPlayer({ name: 'budi', charId: 'penyihir' }).error);
  assert.ok(room.addPlayer({ name: 'Sari', charId: 'tidakada' }).error);
  const again = room.addPlayer({ name: 'Budi', charId: 'ksatria', playerToken: a.player.token });
  assert.strictEqual(again.player.id, a.player.id);
  for (let i = 0; i < 19; i++) assert.ok(room.addPlayer({ name: `P${i}`, charId: 'pemanah' }).player);
  assert.match(room.addPlayer({ name: 'Lebih', charId: 'pemanah' }).error, /penuh/);
});

test('kelas yang menjawab benar semua mengalahkan Raja Iblis tepat di soal terakhir', () => {
  const qs = mkQuestions(20);
  const room = new Room('ABCDE', { questions: qs });
  const ids = ['Ana', 'Beni', 'Cici'].map((n) => room.addPlayer({ name: n, charId: 'penyihir' }).player.id);
  room.start();
  const defeatedAt = [];
  let last;
  let ults = 0;
  for (let i = 0; i < 20; i++) {
    assert.ok(room.nextQuestion().ok);
    ids.forEach((id) => room.submitAnswer(id, qs[i].answer));
    last = room.reveal();
    if (last.enemy.defeated) defeatedAt.push(i + 1);
    ults += last.results.filter((r) => r.ultimate).length;
  }
  assert.deepStrictEqual(defeatedAt, [3, 6, 9, 12, 16, 20]);
  assert.strictEqual(last.finished, true);
  assert.strictEqual(last.victory, true);
  assert.strictEqual(ults, 3 * 6); // streak 3,6,...,18
});

test('jawaban salah membuat karakter terkena serangan dan bisa pingsan', () => {
  const qs = mkQuestions(10);
  const room = new Room('ABCDE', { questions: qs });
  const id = room.addPlayer({ name: 'Dodi', charId: 'paladin' }).player.id;
  room.start();
  let r;
  for (let i = 0; i < 5; i++) {
    room.nextQuestion();
    room.submitAnswer(id, (qs[i].answer + 1) % 4);
    r = room.reveal();
  }
  const me = r.results.find((x) => x.id === id);
  assert.strictEqual(me.correct, false);
  assert.strictEqual(room.players.get(id).ko, true);
  assert.strictEqual(room.players.get(id).score, 0);
  // benar lagi -> bangkit
  room.nextQuestion();
  room.submitAnswer(id, qs[5].answer);
  r = room.reveal();
  assert.strictEqual(r.results[0].revived, true);
});

test('soal habis sebelum boss kalah = kekalahan', () => {
  const qs = mkQuestions(6);
  const room = new Room('ABCDE', { questions: qs });
  room.addPlayer({ name: 'Eka', charId: 'assassin' });
  room.start();
  let r;
  for (let i = 0; i < 6; i++) { room.nextQuestion(); r = room.reveal(); }
  assert.strictEqual(r.finished, true);
  assert.strictEqual(r.victory, false);
  assert.strictEqual(room.state, 'finished');
});
