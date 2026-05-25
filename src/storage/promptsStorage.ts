import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_QUESTIONS, PotLuckQuestion } from '../prompts/potLuck';

const KEY = '@smartypot_questions_v1';

export async function loadQuestions(): Promise<PotLuckQuestion[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_QUESTIONS;
    const parsed = JSON.parse(raw) as PotLuckQuestion[];
    return parsed;
  } catch {
    return DEFAULT_QUESTIONS;
  }
}

export async function saveQuestions(questions: PotLuckQuestion[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(questions));
}

export async function resetQuestions(): Promise<PotLuckQuestion[]> {
  await AsyncStorage.setItem(KEY, JSON.stringify(DEFAULT_QUESTIONS));
  return DEFAULT_QUESTIONS;
}
