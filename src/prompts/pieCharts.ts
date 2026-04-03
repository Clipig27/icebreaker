// ─────────────────────────────────────────────────────────────────────────────
// Pie Charts — Prompt Bank
// "Who is most likely to…" questions. Players vote for a group member.
// isCustom marks prompts added by players in the setup phase.
// ─────────────────────────────────────────────────────────────────────────────

export interface PieChartPrompt {
  id: string;
  text: string;
  isCustom?: boolean;
}

export const PIE_CHARTS_PROMPTS: PieChartPrompt[] = [
  { id: 'pc1',  text: 'Who is most likely to go viral?' },
  { id: 'pc2',  text: 'Who is most likely to ghost someone?' },
  { id: 'pc3',  text: 'Who is most likely to get rich?' },
  { id: 'pc4',  text: 'Who is most likely to embarrass themselves in public?' },
  { id: 'pc5',  text: 'Who is most likely to survive a zombie apocalypse?' },
  { id: 'pc6',  text: 'Who is most likely to forget their own birthday plans?' },
  { id: 'pc7',  text: 'Who is most likely to become famous for something weird?' },
  { id: 'pc8',  text: 'Who is most likely to start drama by accident?' },
  { id: 'pc9',  text: 'Who is most likely to end up on reality TV?' },
  { id: 'pc10', text: 'Who is most likely to get canceled first?' },
  { id: 'pc11', text: 'Who is most likely to cry at a movie?' },
  { id: 'pc12', text: 'Who is most likely to be the last one to know something?' },
  { id: 'pc13', text: 'Who is most likely to accidentally text the wrong person?' },
  { id: 'pc14', text: 'Who is most likely to show up late to their own event?' },
  { id: 'pc15', text: 'Who is most likely to spend their savings in one weekend?' },
  { id: 'pc16', text: 'Who is most likely to start a cult?' },
  { id: 'pc17', text: 'Who is most likely to be on a podcast?' },
  { id: 'pc18', text: 'Who is most likely to get into an argument with a stranger?' },
  { id: 'pc19', text: 'Who is most likely to forget your birthday?' },
  { id: 'pc20', text: 'Who is most likely to move to another country?' },
  { id: 'pc21', text: 'Who is most likely to invent something?' },
  { id: 'pc22', text: 'Who is most likely to go skydiving?' },
  { id: 'pc23', text: 'Who is most likely to have a secret second life?' },
  { id: 'pc24', text: 'Who is most likely to say something they immediately regret?' },
  { id: 'pc25', text: 'Who is most likely to be the group parent?' },
  { id: 'pc26', text: 'Who is most likely to become a hermit?' },
  { id: 'pc27', text: 'Who is most likely to date someone they met online?' },
  { id: 'pc28', text: 'Who is most likely to quit their job on the spot?' },
  { id: 'pc29', text: 'Who is most likely to win a random game show?' },
  { id: 'pc30', text: 'Who is most likely to be overly dramatic about nothing?' },
];
