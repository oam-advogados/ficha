/* ====================================================================
 * Ficha OAM - PWA (v1.0)
 * Captura ficha de atendimento, fotos, e envia por email
 * ==================================================================== */

const EMAIL_DESTINO = "oamcybernet@gmail.com";

// Configurações de redimensionamento de fotos
const FOTO_CLIENTE_LARGURA_MAX = 800;   // foto do cliente (rosto), menor
const DOC_LARGURA_MAX = 1500;            // foto de documento, precisa ler letra miúda
const JPEG_QUALIDADE = 0.8;

// ====================================================================
// REGISTRO DO SERVICE WORKER (para a PWA poder ser instalada)
// ====================================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.warn('SW falhou:', err);
    });
  });
}

// ====================================================================
// ESTADO
// ====================================================================
let fotoCliente = null;   // { blob, dataUrl }
let docs = [];            // array de { id, blob, dataUrl, descricao }
let proxId = 1;

// ====================================================================
// INICIALIZAÇÃO
// ====================================================================
window.addEventListener('DOMContentLoaded', () => {
  // Data de atendimento = hoje
  const hoje = new Date().toISOString().split('T')[0];
  document.querySelector('input[name="data_atendimento"]').value = hoje;

  // Foto do cliente
  document.getElementById('foto-cliente-input').addEventListener('change', onFotoClienteSelecionada);
  document.getElementById('btn-remover-foto-cliente').addEventListener('click', removerFotoCliente);

  // Documentos
  document.getElementById('doc-input').addEventListener('change', onDocSelecionado);

  // Botões da barra inferior
  document.getElementById('btn-limpar').addEventListener('click', limparTudo);
  document.getElementById('btn-enviar').addEventListener('click', enviarPorEmail);

  // Botão fechar overlay
  document.getElementById('btn-fechar-overlay').addEventListener('click', () => {
    document.getElementById('overlay').hidden = true;
    document.getElementById('btn-fechar-overlay').hidden = true;
  });
});

// ====================================================================
// REDIMENSIONAMENTO DE IMAGEM (canvas)
// ====================================================================
function redimensionarImagem(file, larguraMax) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > larguraMax) {
          height = Math.round(height * larguraMax / width);
          width = larguraMax;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("Falha ao gerar blob"));
            return;
          }
          const reader2 = new FileReader();
          reader2.onload = () => resolve({
            blob,
            dataUrl: reader2.result,
            largura: width,
            altura: height,
            tamanho_kb: Math.round(blob.size / 1024),
          });
          reader2.readAsDataURL(blob);
        }, 'image/jpeg', JPEG_QUALIDADE);
      };
      img.onerror = () => reject(new Error("Imagem invalida"));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
    reader.readAsDataURL(file);
  });
}

// ====================================================================
// FOTO DO CLIENTE
// ====================================================================
async function onFotoClienteSelecionada(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  try {
    const r = await redimensionarImagem(file, FOTO_CLIENTE_LARGURA_MAX);
    fotoCliente = r;
    const preview = document.getElementById('foto-cliente-preview');
    preview.innerHTML = '';
    const img = document.createElement('img');
    img.src = r.dataUrl;
    preview.appendChild(img);
  } catch (e) {
    alert('Nao foi possivel processar a foto: ' + e.message);
  }
  ev.target.value = '';  // permite escolher mesma foto novamente
}

function removerFotoCliente() {
  fotoCliente = null;
  document.getElementById('foto-cliente-preview').innerHTML = '(sem foto)';
}

// ====================================================================
// FOTOS DE DOCUMENTOS (multi)
// ====================================================================
async function onDocSelecionado(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  try {
    const r = await redimensionarImagem(file, DOC_LARGURA_MAX);
    const id = proxId++;
    docs.push({ id, blob: r.blob, dataUrl: r.dataUrl, descricao: '', tamanho_kb: r.tamanho_kb });
    renderListaDocs();
  } catch (e) {
    alert('Nao foi possivel processar o documento: ' + e.message);
  }
  ev.target.value = '';
}

function renderListaDocs() {
  const lista = document.getElementById('lista-docs');
  lista.innerHTML = '';
  if (docs.length === 0) return;

  docs.forEach((doc, idx) => {
    const card = document.createElement('div');
    card.className = 'doc-card';
    card.innerHTML = `
      <img src="${doc.dataUrl}" alt="doc">
      <div class="doc-info">
        <input type="text" placeholder="Descrição (opcional) — ex: CTPS pág 1, Holerite jan/2025"
               value="${escapeHtml(doc.descricao)}">
        <span class="doc-meta">Foto ${idx + 1} • ${doc.tamanho_kb} KB</span>
      </div>
      <button type="button" class="btn-remover-doc">X</button>
    `;
    const inputDesc = card.querySelector('input');
    inputDesc.addEventListener('input', (e) => { doc.descricao = e.target.value; });
    card.querySelector('.btn-remover-doc').addEventListener('click', () => {
      docs = docs.filter(d => d.id !== doc.id);
      renderListaDocs();
    });
    lista.appendChild(card);
  });
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ====================================================================
// COLETAR DADOS DA FICHA
// ====================================================================
function coletarFicha() {
  const form = document.getElementById('ficha');
  const dados = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') dados[el.name] = el.checked;
    else dados[el.name] = (el.value || '').trim();
  }
  return dados;
}

function parseValorBrl(s) {
  if (!s) return null;
  const t = String(s).replace(/[^\d,.]/g, '').trim();
  if (!t) return null;
  const lastComma = t.lastIndexOf(',');
  const lastDot = t.lastIndexOf('.');
  const last = Math.max(lastComma, lastDot);
  if (last === -1) {
    const v = parseFloat(t);
    return isNaN(v) ? null : v;
  }
  const inteira = t.substring(0, last).replace(/[,.]/g, '');
  const decimal = t.substring(last + 1);
  const v = parseFloat(`${inteira || '0'}.${decimal || '0'}`);
  return isNaN(v) ? null : v;
}

function montarEstrutura(d) {
  const TIPO_MAP = {
    "Pedido de demissão": "pedido_demissao",
    "Sem justa causa": "sem_justa_causa",
    "Justa causa (impugnar)": "justa_causa",
    "Rescisão indireta": "rescisao_indireta",
    "Contrato ainda ativo": "contrato_ativo",
  };
  return {
    atendimento: {
      data_entrada_escritorio: d.data_atendimento,
      origem_cliente: d.origem_cliente,
      origem_detalhe: d.origem_detalhe,
      advogado_responsavel: d.adv_responsavel,
    },
    reclamante: {
      nome: d.rec_nome, apelido: d.rec_apelido,
      data_nascimento: d.rec_data_nasc, estado_civil: d.rec_estado_civil,
      nacionalidade: "brasileiro(a)",
      rg: d.rec_rg, cpf: d.rec_cpf, pis: d.rec_pis, ctps: d.rec_ctps,
      nome_mae: d.rec_nome_mae,
      telefones: d.rec_telefones, whatsapp: d.rec_whatsapp,
      email: d.rec_email,
      endereco: d.rec_endereco, cep: d.rec_cep,
    },
    contrato: {
      admissao: d.adm_data, demissao: d.dem_data,
      data_baixa_trct: d.trct_data,
      salario_base: parseValorBrl(d.salario_base),
      tipo_causa: TIPO_MAP[d.tipo_causa] || d.tipo_causa,
      tipo_causa_descricao: d.tipo_causa,
      funcao_ctps: d.funcao_ctps, funcao_real: d.funcao_real,
      linhas_itinerarios: d.linhas,
      justa_causa_motivo: d.justa_causa_motivo,
      defesa_escrita: d.defesa_escrita,
      aviso_previo: d.aviso_previo, aviso_reducao: d.aviso_reducao,
      trct_recebeu: d.trct_recebeu, trct_trouxe: d.trct_trouxe,
      contracheques_trouxe: d.contracheques_trouxe,
      acordo_judicial_periodo: d.acordo_judicial,
      situacao_atual: d.situacao_atual, novo_emprego: d.novo_emprego,
    },
    reclamada: {
      razao_social: d.emp_nome,
      consorcio_nome: d.emp_consorcio,
      cor_carro: d.emp_cor_carro,
      em_recuperacao: d.emp_recuperacao,
      lide_simulada_indicada: d.emp_lide_simulada,
    },
    jornada: {
      escala: d.jor_escala, turno: d.jor_turno,
      turnos_periodos: d.jor_turnos_periodos,
      horario_inicio_ponto: d.jor_pisa_ponto,
      horario_fim_ponto: d.jor_termino_ponto,
      horario_fim_arrecadacao: d.jor_termino_arrecadacao,
      dobra_fazia: d.jor_dobra,
      dobra_horario: d.jor_dobra_horario,
      dobra_qtd_semana: d.jor_dobra_qtd,
      trabalha_domingos: d.jor_domingos, noturno: d.jor_noturno,
      folgas: d.jor_folgas,
      intervalo_placa: d.int_placa,
      horario_almoco: d.int_almoco_horario,
      tem_banheiro: d.tem_banheiro, tem_bebedouro: d.tem_bebedouro,
      intervalo: d.int_placa ? "integral" : "suprimido",
    },
    acumulo_funcao: {
      tem: d.acu_manobrista_dirigia || d.acu_mini_dirigia_micrao
        || d.acu_motorista_cobrava || d.acu_fiscal_despachante,
      manobrista_dirigia: d.acu_manobrista_dirigia,
      mini_dirigia_micrao: d.acu_mini_dirigia_micrao,
      motorista_cobrava: d.acu_motorista_cobrava,
      fiscal_despachante: d.acu_fiscal_despachante,
      periodo: d.acu_periodo,
      fiscal_frequencia: d.acu_fiscal_freq,
      outras_funcoes: d.acu_outras_funcoes,
    },
    descontos: {
      tem: d.desc_avaria || d.desc_multa || d.desc_diferenca_roleta,
      avaria: d.desc_avaria, multa: d.desc_multa,
      diferenca_roleta: d.desc_diferenca_roleta,
      rubricas: d.desc_observacoes,
    },
    troco: {
      empresa_fornecia: d.troco_fornecido_empresa,
      ofendido_passageiro: d.troco_ofendido_passageiro,
      valor_portava: parseValorBrl(d.troco_valor_portava),
    },
    danos_morais: {
      banheiro: !d.tem_banheiro,
      bebedouro: !d.tem_bebedouro,
      troco: !!d.troco_ofendido_passageiro,
      assedio: !!d.dano_assedio_sexual,
      assedio_producao: !!d.dano_assedio_producao,
      lista_exposta: !!d.dano_lista_exposta,
      lista_motivo: d.dano_lista_motivo,
      levou_falta_producao: !!d.dano_levou_falta,
      detalhes: d.dano_assedio_detalhes,
    },
    beneficios: {
      vale_alimentacao_recebeu: d.va_sodexo_recebeu,
      vale_alimentacao_cortado: d.va_sodexo_cortado,
      vale_alimentacao_mes: parseValorBrl(d.va_valor_mensal),
    },
    ferias: { tirou: d.ferias_tirou, periodo: d.ferias_periodo },
    documentos: {
      ctps: d.doc_ctps, rg: d.doc_rg, cpf: d.doc_cpf, cnh: d.doc_cnh,
      holerites: d.doc_holerites, cartao_ponto: d.doc_cartao_ponto,
      escalas: d.doc_escalas, trct: d.doc_trct,
      extrato_fgts: d.doc_extrato_fgts,
      advertencias: d.doc_advertencias,
      contrato: d.doc_contrato,
    },
    observacoes: d.obs_geral,
    relacionamento: {
      como_chamar: d.rel_como_chamar,
      saude: d.rel_saude, familia: d.rel_familia,
      particularidades: d.rel_particularidades,
      proximos_contatos: d.rel_proximos_contatos,
    },
    metadata: {
      preenchido_em: new Date().toISOString(),
      versao_ficha: "1.0-pwa",
      fonte: "PWA Ficha OAM",
    },
  };
}

function validar(d) {
  const faltam = [];
  if (!d.rec_nome) faltam.push('Nome completo');
  if (!d.emp_nome) faltam.push('Empresa (razão social)');
  if (!d.tipo_causa) faltam.push('Motivo do desligamento');
  if (!d.adm_data) faltam.push('Data de admissão');
  return faltam;
}

// ====================================================================
// LIMPAR FORMULÁRIO
// ====================================================================
function limparTudo() {
  if (!confirm('Limpar todos os campos? A foto e os documentos também serão removidos.')) return;
  document.getElementById('ficha').reset();
  fotoCliente = null;
  document.getElementById('foto-cliente-preview').innerHTML = '(sem foto)';
  docs = [];
  renderListaDocs();
  // Restaura data
  const hoje = new Date().toISOString().split('T')[0];
  document.querySelector('input[name="data_atendimento"]').value = hoje;
}

// ====================================================================
// MONTAR CORPO DO EMAIL
// ====================================================================
function montarCorpo(d, est) {
  const nome = (d.rec_nome || '').toUpperCase();
  const empresa = (d.emp_nome || '').toUpperCase();
  const linhas = [];
  linhas.push(`FICHA DE ATENDIMENTO — OAM ADVOGADOS`);
  linhas.push(`========================================`);
  linhas.push(`Cliente: ${nome}`);
  linhas.push(`Empresa: ${empresa}`);
  linhas.push(`Data atendimento: ${d.data_atendimento || '(em branco)'}`);
  linhas.push(`Origem do cliente: ${d.origem_cliente || '-'}${d.origem_detalhe ? ' (' + d.origem_detalhe + ')' : ''}`);
  linhas.push(`Atendido por: ${d.adv_responsavel || '(não informado)'}`);
  linhas.push(``);
  linhas.push(`--- CONTRATO ---`);
  linhas.push(`Função CTPS: ${d.funcao_ctps || '-'}`);
  linhas.push(`Função real: ${d.funcao_real || '-'}`);
  linhas.push(`Admissão: ${d.adm_data || '-'} | Demissão: ${d.dem_data || '-'}`);
  linhas.push(`Salário: R$ ${d.salario_base || '-'}`);
  linhas.push(`Tipo de causa: ${d.tipo_causa || '-'}`);
  if (d.emp_consorcio) linhas.push(`Consórcio: ${d.emp_consorcio}`);
  if (d.emp_recuperacao) linhas.push(`*** EMPRESA EM RECUPERAÇÃO JUDICIAL ***`);
  linhas.push(``);
  linhas.push(`--- JORNADA ---`);
  linhas.push(`Escala: ${d.jor_escala || '-'} | Turno: ${d.jor_turno || '-'}`);
  linhas.push(`Início: ${d.jor_pisa_ponto || '-'} | Fim: ${d.jor_termino_ponto || d.jor_termino_arrecadacao || '-'}`);
  if (d.jor_dobra) linhas.push(`Fazia dobra (${d.jor_dobra_qtd || '?'} por semana)`);
  linhas.push(``);
  linhas.push(`--- DANOS / DESCONTOS ---`);
  if (!d.tem_banheiro) linhas.push(`• Falta de banheiro`);
  if (!d.tem_bebedouro) linhas.push(`• Falta de bebedouro`);
  if (d.troco_ofendido_passageiro) linhas.push(`• Ofensa por falta de troco`);
  if (d.dano_assedio_producao) linhas.push(`• Assédio moral por produção`);
  if (d.dano_assedio_sexual) linhas.push(`• Assédio sexual / briga / perseguição`);
  if (d.desc_avaria) linhas.push(`• Desconto por avaria`);
  if (d.desc_multa) linhas.push(`• Desconto por multa`);
  if (d.desc_diferenca_roleta) linhas.push(`• Diferença na roleta`);
  if (d.acu_manobrista_dirigia || d.acu_mini_dirigia_micrao || d.acu_motorista_cobrava || d.acu_fiscal_despachante) {
    linhas.push(`• Acúmulo de função`);
  }
  linhas.push(``);
  if (d.obs_geral) {
    linhas.push(`--- OBSERVAÇÕES ---`);
    linhas.push(d.obs_geral);
    linhas.push(``);
  }

  // Anexos
  linhas.push(`--- ANEXOS ---`);
  let n = 1;
  if (fotoCliente) linhas.push(`${n++}. foto_cliente.jpg`);
  docs.forEach((doc) => {
    const desc = doc.descricao ? ` — ${doc.descricao}` : '';
    linhas.push(`${n++}. doc_${String(n - 1).padStart(2, '0')}.jpg${desc}`);
  });
  linhas.push(`Total de anexos: ${(fotoCliente ? 1 : 0) + docs.length}`);
  linhas.push(``);
  linhas.push(`(Ficha estruturada está em ficha_dados.json em anexo)`);
  linhas.push(`(PWA v${est.metadata.versao_ficha})`);
  return linhas.join('\n');
}

function nomeArquivoBase(d) {
  const limp = (s) => (s || '').replace(/[^A-Za-z0-9]+/g, '_').toUpperCase();
  return `${limp(d.rec_nome)}_x_${limp(d.emp_nome)}`;
}

// ====================================================================
// ENVIAR POR EMAIL (Web Share API com fallback)
// ====================================================================
async function enviarPorEmail() {
  const d = coletarFicha();
  const faltam = validar(d);
  if (faltam.length) {
    alert('Preencha antes de enviar:\n• ' + faltam.join('\n• '));
    return;
  }

  showOverlay('Preparando envio...');
  try {
    const est = montarEstrutura(d);
    const corpo = montarCorpo(d, est);
    const assunto = `FICHA: ${(d.rec_nome || '').toUpperCase()} x ${(d.emp_nome || '').toUpperCase()} - ${d.data_atendimento || ''}`;

    // Monta lista de arquivos
    const arquivos = [];

    // 1) JSON estruturado
    const jsonBlob = new Blob([JSON.stringify(est, null, 2)], { type: 'application/json' });
    arquivos.push(new File([jsonBlob], 'ficha_dados.json', { type: 'application/json' }));

    // 2) Foto do cliente
    if (fotoCliente) {
      arquivos.push(new File([fotoCliente.blob], 'foto_cliente.jpg', { type: 'image/jpeg' }));
    }

    // 3) Fotos dos documentos
    docs.forEach((doc, idx) => {
      const num = String(idx + 1).padStart(2, '0');
      let nome = `doc_${num}`;
      if (doc.descricao) {
        const slug = doc.descricao.replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40);
        if (slug) nome += `_${slug}`;
      }
      nome += '.jpg';
      arquivos.push(new File([doc.blob], nome, { type: 'image/jpeg' }));
    });

    // Tenta Web Share API com arquivos (Android Chrome moderno)
    const shareData = {
      title: assunto,
      text: corpo,
      files: arquivos,
    };

    if (navigator.canShare && navigator.canShare(shareData)) {
      hideOverlay();
      try {
        await navigator.share(shareData);
        showOverlay(`✔ Compartilhamento concluído.\n\nNo Gmail: confira o destinatário (${EMAIL_DESTINO}) antes de enviar.`, true);
      } catch (e) {
        if (e.name !== 'AbortError') {
          showOverlay('Compartilhamento cancelado ou falhou:\n' + e.message, true);
        } else {
          hideOverlay();
        }
      }
      return;
    }

    // FALLBACK: Web Share API não suporta arquivos neste celular
    // → Baixa todos os arquivos e abre o Gmail por mailto: (anexação manual)
    hideOverlay();

    if (!confirm(
      'Este celular não suporta envio direto com anexos.\n\n' +
      'Vou baixar os arquivos para você e abrir o Gmail. Depois é só anexar manualmente.\n\nContinuar?'
    )) {
      return;
    }

    // Baixa cada arquivo
    arquivos.forEach((f) => {
      const url = URL.createObjectURL(f);
      const a = document.createElement('a');
      a.href = url;
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 200);
    });

    // Abre mailto
    const mailto = `mailto:${EMAIL_DESTINO}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
    setTimeout(() => { window.location.href = mailto; }, 500);

  } catch (e) {
    hideOverlay();
    alert('Erro: ' + e.message);
  }
}

// ====================================================================
// OVERLAY DE STATUS
// ====================================================================
function showOverlay(msg, comBotao = false) {
  document.getElementById('overlay-msg').textContent = msg;
  document.getElementById('overlay').hidden = false;
  document.getElementById('btn-fechar-overlay').hidden = !comBotao;
}

function hideOverlay() {
  document.getElementById('overlay').hidden = true;
  document.getElementById('btn-fechar-overlay').hidden = true;
}
