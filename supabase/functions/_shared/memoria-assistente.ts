import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { FalhaDePersistencia } from './dominio.ts';

export type MensagemMemoria = { role: 'user' | 'assistant'; content: string };

export class MemoriaAssistente {
  constructor(private readonly banco: SupabaseClient, private readonly bancoAdmin: SupabaseClient,
    private readonly usuarioId: string) {}

  async listar(limite = 100): Promise<MensagemMemoria[]> {
    const { data, error } = await this.banco.from('assistente_mensagens')
      .select('papel,conteudo').eq('usuario_id', this.usuarioId)
      .order('id', { ascending: false }).limit(limite);
    if (error) throw new FalhaDePersistencia('Não foi possível carregar a conversa.');
    return (data ?? []).reverse().map(row => ({ role: row.papel as 'user' | 'assistant', content: row.conteudo }));
  }

  async salvar(pergunta: string, resposta: string): Promise<void> {
    const { error } = await this.bancoAdmin.from('assistente_mensagens').insert([
      { usuario_id: this.usuarioId, papel: 'user', conteudo: pergunta },
      { usuario_id: this.usuarioId, papel: 'assistant', conteudo: resposta },
    ]);
    if (error) throw new FalhaDePersistencia('Não foi possível salvar a conversa.');
  }

  async apagar(): Promise<void> {
    const { error } = await this.banco.from('assistente_mensagens')
      .delete().eq('usuario_id', this.usuarioId);
    if (error) throw new FalhaDePersistencia('Não foi possível apagar a conversa.');
  }
}
