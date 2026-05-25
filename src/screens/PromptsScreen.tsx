import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  Modal, TextInput, Alert, Animated, SectionList,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { PotLuckQuestion } from '../prompts/potLuck';
import { loadQuestions, saveQuestions, resetQuestions } from '../storage/promptsStorage';

// ── Constants ────────────────────────────────────────────────────────────────

const DIFF_LABEL: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const DIFF_COLOR: Record<string, string> = { easy: '#22C55E', medium: '#F59E0B', hard: '#EF4444' };
const DIFF_DOT:   Record<string, string> = { easy: '🟢', medium: '🟡', hard: '🔴' };
const STARTING_POT: Record<string, 1|2|3> = { easy: 1, medium: 2, hard: 3 };

type Difficulty = 'easy' | 'medium' | 'hard';

function makeid(): string {
  return 'c' + Math.random().toString(36).slice(2, 9);
}

// ── DiffBadge ────────────────────────────────────────────────────────────────

function DiffBadge({ diff }: { diff: Difficulty }) {
  return (
    <View style={[badge.wrap, { backgroundColor: DIFF_COLOR[diff] + '22', borderColor: DIFF_COLOR[diff] + '55' }]}>
      <Text style={[badge.text, { color: DIFF_COLOR[diff] }]}>{DIFF_DOT[diff]} {DIFF_LABEL[diff]}</Text>
    </View>
  );
}
const badge = StyleSheet.create({
  wrap: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, alignSelf: 'flex-start' },
  text: { fontSize: 11, fontWeight: '700' },
});

// ── QuestionRow ──────────────────────────────────────────────────────────────

function QuestionRow({
  q, index, onEdit, onDelete,
}: {
  q: PotLuckQuestion;
  index: number;
  onEdit: (q: PotLuckQuestion) => void;
  onDelete: (q: PotLuckQuestion) => void;
}) {
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(entrance, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6,
      delay: Math.min(index * 30, 300),
    } as any).start();
  }, []);

  const opacity    = entrance.interpolate({ inputRange: [0,1], outputRange: [0,1] });
  const translateY = entrance.interpolate({ inputRange: [0,1], outputRange: [12,0] });

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <View style={row.card}>
        <View style={row.top}>
          <DiffBadge diff={q.difficulty} />
          {q.custom && (
            <View style={row.customBadge}>
              <Text style={row.customText}>Custom</Text>
            </View>
          )}
        </View>
        <Text style={row.question}>{q.text}</Text>
        <View style={row.choices}>
          {q.choices.map((c, i) => (
            <Text
              key={i}
              style={[row.choice, i === q.correctIndex && row.correctChoice]}
              numberOfLines={1}
            >
              {i === q.correctIndex ? '✓ ' : '  '}{c}
            </Text>
          ))}
        </View>
        <View style={row.actions}>
          <Pressable style={row.btn} onPress={() => onEdit(q)} hitSlop={8}>
            <Ionicons name="pencil" size={15} color={COLORS.accent} />
            <Text style={[row.btnText, { color: COLORS.accent }]}>Edit</Text>
          </Pressable>
          <Pressable style={row.btn} onPress={() => onDelete(q)} hitSlop={8}>
            <Ionicons name="trash-outline" size={15} color="#EF4444" />
            <Text style={[row.btnText, { color: '#EF4444' }]}>Delete</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const row = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 10,
    gap: 10,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  customBadge: {
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 6, backgroundColor: COLORS.accent + '22',
    borderWidth: 1, borderColor: COLORS.accent + '55',
  },
  customText: { fontSize: 10, fontWeight: '700', color: COLORS.accent },
  question: { fontSize: 15, fontWeight: '600', color: COLORS.text, lineHeight: 21 },
  choices: { gap: 3 },
  choice: { fontSize: 13, color: COLORS.text2 },
  correctChoice: { color: '#22C55E', fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 16, paddingTop: 2 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  btnText: { fontSize: 13, fontWeight: '600' },
});

// ── EditModal ────────────────────────────────────────────────────────────────

type EditState = {
  text: string;
  choices: [string, string, string, string];
  correctIndex: 0|1|2|3;
  difficulty: Difficulty;
};

function EditModal({
  visible,
  initial,
  onSave,
  onClose,
}: {
  visible: boolean;
  initial: EditState | null;
  onSave: (s: EditState) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [choices, setChoices] = useState<[string,string,string,string]>(['','','','']);
  const [correctIndex, setCorrectIndex] = useState<0|1|2|3>(0);
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');

  useEffect(() => {
    if (initial) {
      setText(initial.text);
      setChoices([...initial.choices] as [string,string,string,string]);
      setCorrectIndex(initial.correctIndex);
      setDifficulty(initial.difficulty);
    } else {
      setText('');
      setChoices(['','','','']);
      setCorrectIndex(0);
      setDifficulty('easy');
    }
  }, [visible, initial]);

  const handleSave = () => {
    if (!text.trim()) { Alert.alert('Missing question', 'Please enter a question.'); return; }
    if (choices.some(c => !c.trim())) { Alert.alert('Missing choices', 'All 4 choices are required.'); return; }
    onSave({ text: text.trim(), choices: choices.map(c => c.trim()) as [string,string,string,string], correctIndex, difficulty });
  };

  const updateChoice = (i: number, val: string) => {
    const next = [...choices] as [string,string,string,string];
    next[i] = val;
    setChoices(next);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={em.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={em.header}>
            <Text style={em.title}>{initial ? 'Edit Question' : 'New Question'}</Text>
            <Pressable onPress={onClose} hitSlop={12} style={em.closeBtn}>
              <Ionicons name="close" size={20} color={COLORS.text2} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={em.body} keyboardShouldPersistTaps="handled">
            {/* Difficulty */}
            <Text style={em.label}>DIFFICULTY</Text>
            <View style={em.diffRow}>
              {(['easy','medium','hard'] as Difficulty[]).map(d => (
                <Pressable
                  key={d}
                  style={[em.diffBtn, difficulty === d && { backgroundColor: DIFF_COLOR[d] + '33', borderColor: DIFF_COLOR[d] }]}
                  onPress={() => setDifficulty(d)}
                >
                  <Text style={[em.diffBtnText, difficulty === d && { color: DIFF_COLOR[d] }]}>
                    {DIFF_DOT[d]} {DIFF_LABEL[d]}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Question */}
            <Text style={em.label}>QUESTION</Text>
            <TextInput
              style={em.input}
              value={text}
              onChangeText={setText}
              placeholder="Enter question text…"
              placeholderTextColor={COLORS.text3}
              multiline
              numberOfLines={3}
            />

            {/* Choices */}
            <Text style={em.label}>CHOICES (tap ✓ to set correct answer)</Text>
            {choices.map((c, i) => (
              <View key={i} style={[em.choiceRow, correctIndex === i && em.choiceRowActive]}>
                <Pressable onPress={() => setCorrectIndex(i as 0|1|2|3)} style={em.checkBtn}>
                  <View style={[em.check, correctIndex === i && em.checkActive]}>
                    {correctIndex === i && <Ionicons name="checkmark" size={13} color="#fff" />}
                  </View>
                </Pressable>
                <TextInput
                  style={em.choiceInput}
                  value={c}
                  onChangeText={v => updateChoice(i, v)}
                  placeholder={`Choice ${i + 1}`}
                  placeholderTextColor={COLORS.text3}
                />
              </View>
            ))}
          </ScrollView>

          <View style={em.footer}>
            <Pressable style={em.saveBtn} onPress={handleSave}>
              <Text style={em.saveBtnText}>Save Question</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const em = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#1C1C1E' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  title: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: COLORS.surface2, alignItems: 'center', justifyContent: 'center',
  },
  body: { padding: 20, gap: 12 },
  label: {
    fontSize: 10, fontWeight: '700', color: COLORS.text3,
    textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: -4,
  },
  diffRow: { flexDirection: 'row', gap: 8 },
  diffBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center',
  },
  diffBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.text2 },
  input: {
    backgroundColor: COLORS.surface2, borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.border, padding: 12,
    fontSize: 15, color: COLORS.text, minHeight: 80,
    textAlignVertical: 'top',
  },
  choiceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.surface2, borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.border, paddingRight: 12, paddingLeft: 6,
  },
  choiceRowActive: { borderColor: '#22C55E' },
  checkBtn: { padding: 8 },
  check: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: COLORS.text3,
    alignItems: 'center', justifyContent: 'center',
  },
  checkActive: { backgroundColor: '#22C55E', borderColor: '#22C55E' },
  choiceInput: { flex: 1, fontSize: 15, color: COLORS.text, paddingVertical: 12 },
  footer: { padding: 20, paddingBottom: 8 },
  saveBtn: {
    backgroundColor: COLORS.accent, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  saveBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
});

// ── SectionHeader ────────────────────────────────────────────────────────────

function SectionHeader({ title, count, color }: { title: string; count: number; color: string }) {
  return (
    <View style={sh.wrap}>
      <View style={[sh.dot, { backgroundColor: color }]} />
      <Text style={sh.title}>{title}</Text>
      <View style={[sh.countBadge, { backgroundColor: color + '22' }]}>
        <Text style={[sh.countText, { color }]}>{count}</Text>
      </View>
    </View>
  );
}
const sh = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 20,
    backgroundColor: COLORS.bg,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  title: { fontSize: 13, fontWeight: '800', color: COLORS.text, flex: 1 },
  countBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  countText: { fontSize: 12, fontWeight: '700' },
});

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function PromptsScreen() {
  const [questions, setQuestions] = useState<PotLuckQuestion[]>([]);
  const [editing, setEditing] = useState<PotLuckQuestion | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [filter, setFilter] = useState<Difficulty | 'all'>('all');

  useEffect(() => {
    loadQuestions().then(setQuestions);
  }, []);

  const persist = useCallback(async (updated: PotLuckQuestion[]) => {
    setQuestions(updated);
    await saveQuestions(updated);
  }, []);

  const handleEdit = (q: PotLuckQuestion) => {
    setEditing(q);
    setIsAdding(false);
    setModalVisible(true);
  };

  const handleAdd = () => {
    setEditing(null);
    setIsAdding(true);
    setModalVisible(true);
  };

  const handleDelete = (q: PotLuckQuestion) => {
    Alert.alert(
      'Delete Question',
      'Are you sure you want to delete this question?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: () => persist(questions.filter(x => x.id !== q.id)),
        },
      ],
    );
  };

  const handleSave = (s: ReturnType<typeof getEditState>) => {
    if (!s) return;
    if (editing) {
      persist(questions.map(q => q.id === editing.id ? { ...editing, ...s, startingPot: STARTING_POT[s.difficulty] } : q));
    } else {
      const newQ: PotLuckQuestion = {
        id: makeid(),
        text: s.text,
        choices: s.choices,
        correctIndex: s.correctIndex,
        difficulty: s.difficulty,
        startingPot: STARTING_POT[s.difficulty],
        custom: true,
      };
      persist([...questions, newQ]);
    }
    setModalVisible(false);
  };

  const handleReset = () => {
    Alert.alert(
      'Reset to Defaults',
      'This will remove all custom questions and restore the original 70 questions.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset', style: 'destructive',
          onPress: async () => {
            const q = await resetQuestions();
            setQuestions(q);
          },
        },
      ],
    );
  };

  // Build sections
  const displayed = filter === 'all' ? questions : questions.filter(q => q.difficulty === filter);
  const easy   = displayed.filter(q => q.difficulty === 'easy');
  const medium = displayed.filter(q => q.difficulty === 'medium');
  const hard   = displayed.filter(q => q.difficulty === 'hard');

  const sections = [
    ...(easy.length   ? [{ title: 'Easy',   color: '#22C55E', data: easy   }] : []),
    ...(medium.length ? [{ title: 'Medium', color: '#F59E0B', data: medium }] : []),
    ...(hard.length   ? [{ title: 'Hard',   color: '#EF4444', data: hard   }] : []),
  ];

  const initialEditState: EditState | null = editing
    ? { text: editing.text, choices: editing.choices, correctIndex: editing.correctIndex, difficulty: editing.difficulty }
    : null;

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      {/* Top bar */}
      <View style={s.topBar}>
        <View style={s.filterRow}>
          {(['all','easy','medium','hard'] as const).map(f => (
            <Pressable
              key={f}
              style={[s.filterBtn, filter === f && { backgroundColor: DIFF_COLOR[f] ? DIFF_COLOR[f] + '33' : COLORS.accent + '33', borderColor: DIFF_COLOR[f] || COLORS.accent }]}
              onPress={() => setFilter(f)}
            >
              <Text style={[s.filterText, filter === f && { color: DIFF_COLOR[f] || COLORS.accent }]}>
                {f === 'all' ? 'All' : DIFF_DOT[f] + ' ' + DIFF_LABEL[f]}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={s.actionRow}>
          <Pressable style={s.resetBtn} onPress={handleReset}>
            <Ionicons name="refresh" size={15} color={COLORS.text2} />
            <Text style={s.resetText}>Reset</Text>
          </Pressable>
          <Pressable style={s.addBtn} onPress={handleAdd}>
            <Ionicons name="add" size={17} color="#fff" />
            <Text style={s.addText}>Add Question</Text>
          </Pressable>
        </View>
      </View>

      {/* Count */}
      <Text style={s.count}>{displayed.length} question{displayed.length !== 1 ? 's' : ''}</Text>

      <SectionList
        sections={sections}
        keyExtractor={item => item.id}
        contentContainerStyle={s.list}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => (
          <SectionHeader title={section.title} count={section.data.length} color={section.color} />
        )}
        renderItem={({ item, index }) => (
          <View style={s.itemWrap}>
            <QuestionRow q={item} index={index} onEdit={handleEdit} onDelete={handleDelete} />
          </View>
        )}
      />

      <EditModal
        visible={modalVisible}
        initial={initialEditState}
        onSave={handleSave as any}
        onClose={() => setModalVisible(false)}
      />
    </SafeAreaView>
  );
}

// helper — just to satisfy TS for the onSave type
function getEditState(): EditState { return { text: '', choices: ['','','',''], correctIndex: 0, difficulty: 'easy' }; }

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  topBar: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  filterRow: { flexDirection: 'row', gap: 6 },
  filterBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.border, alignItems: 'center',
  },
  filterText: { fontSize: 12, fontWeight: '700', color: COLORS.text2 },
  actionRow: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'flex-end' },
  resetBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  resetText: { fontSize: 13, fontWeight: '600', color: COLORS.text2 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.accent, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
  },
  addText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  count: {
    fontSize: 12, color: COLORS.text3, fontWeight: '500',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4,
  },
  list: { paddingBottom: 40 },
  itemWrap: { paddingHorizontal: 16 },
});
