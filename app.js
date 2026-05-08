/* ====================================================================
 * Ficha OAM - PWA (v1.2)
 * Captura ficha de atendimento, fotos, e envia por email.
 * Anexos: ficha_dados.json (Skynet), ficha_visual.doc (advogados),
 * foto_cliente.jpg, doc_NN.jpg.
 *
 * v1.2: corrige "permission denied" no Web Share API trocando MIME do .doc
 *       de application/msword para text/html (msword é bloqueado pelo Chrome
 *       Android). Adiciona fallback automático para mailto+download quando
 *       o share falha — Gmail abre com oamcybernet@gmail.com já preenchido.
 * ==================================================================== */

const EMAIL_DESTINO = "oamcybernet@gmail.com";

const FOTO_CLIENTE_LARGURA_MAX = 800;
const DOC_LARGURA_MAX = 1500;
const JPEG_QUALIDADE = 0.8;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.warn('SW falhou:', err);
    });
  });
}

let fotoCliente = null;
let docs = [];
let proxId = 1;

window.addEventListener('DOMContentLoaded', () => {
  const hoje = new Date().toISOString().split('T')[0];
  document.querySelector('input[name="data_atendimento"]').value = hoje;

  document.getElementById('foto-cliente-input').addEventListener('change', onFotoClienteSelecionada);
  document.getElementById('btn-remover-foto-cliente').addEventListener('click', removerFotoCliente);
  document.getElementById('doc-input').addEventListener('change', onDocSelecionado);
  document.getElementById('btn-limpar').addEventListener('click', limparTudo);
  document.getElementById('btn-enviar').addEventListener('click', enviarPorEmail);

  document.getElementById('btn-fechar-overlay').addEventListener('click', () => {
    document.getElementById('overlay').hidden = true;
    document.getElementById('btn-fechar-overlay').hidden = true;
  });
});

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
          if (!blob) { reject(new Error("Falha ao gerar blob")); return; }
          const reader2 = new FileReader();
          reader2.onload = () => resolve({
            blob, dataUrl: reader2.result,
            largura: width, altura: height,
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
  ev.target.value = '';
}

function removerFotoCliente() {
  fotoCliente = null;
  document.getElementById('foto-cliente-preview').innerHTML = '(sem foto)';
}

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
      versao_ficha: "1.2-pwa",
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

function limparTudo() {
  if (!confirm('Limpar todos os campos? A foto e os documentos também serão removidos.')) return;
  document.getElementById('ficha').reset();
  fotoCliente = null;
  document.getElementById('foto-cliente-preview').innerHTML = '(sem foto)';
  docs = [];
  renderListaDocs();
  const hoje = new Date().toISOString().split('T')[0];
  document.querySelector('input[name="data_atendimento"]').value = hoje;
}

function montarCorpo(d, est) {
  const nome = (d.rec_nome || '').toUpperCase();
  const empresa = (d.emp_nome || '').toUpperCase();
  const linhas = [];
  linhas.push('FICHA DE ATENDIMENTO — OAM ADVOGADOS');
  linhas.push('========================================');
  linhas.push('Cliente: ' + nome);
  linhas.push('Empresa: ' + empresa);
  linhas.push('Data atendimento: ' + (d.data_atendimento || '(em branco)'));
  linhas.push('Origem do cliente: ' + (d.origem_cliente || '-') + (d.origem_detalhe ? ' (' + d.origem_detalhe + ')' : ''));
  linhas.push('Atendido por: ' + (d.adv_responsavel || '(não informado)'));
  linhas.push('');
  linhas.push('--- CONTRATO ---');
  linhas.push('Função CTPS: ' + (d.funcao_ctps || '-'));
  linhas.push('Função real: ' + (d.funcao_real || '-'));
  linhas.push('Admissão: ' + (d.adm_data || '-') + ' | Demissão: ' + (d.dem_data || '-'));
  linhas.push('Salário: R$ ' + (d.salario_base || '-'));
  linhas.push('Tipo de causa: ' + (d.tipo_causa || '-'));
  if (d.emp_consorcio) linhas.push('Consórcio: ' + d.emp_consorcio);
  if (d.emp_recuperacao) linhas.push('*** EMPRESA EM RECUPERAÇÃO JUDICIAL ***');
  linhas.push('');
  linhas.push('--- JORNADA ---');
  linhas.push('Escala: ' + (d.jor_escala || '-') + ' | Turno: ' + (d.jor_turno || '-'));
  linhas.push('Início: ' + (d.jor_pisa_ponto || '-') + ' | Fim: ' + (d.jor_termino_ponto || d.jor_termino_arrecadacao || '-'));
  if (d.jor_dobra) linhas.push('Fazia dobra (' + (d.jor_dobra_qtd || '?') + ' por semana)');
  linhas.push('');
  linhas.push('--- DANOS / DESCONTOS ---');
  if (!d.tem_banheiro) linhas.push('• Falta de banheiro');
  if (!d.tem_bebedouro) linhas.push('• Falta de bebedouro');
  if (d.troco_ofendido_passageiro) linhas.push('• Ofensa por falta de troco');
  if (d.dano_assedio_producao) linhas.push('• Assédio moral por produção');
  if (d.dano_assedio_sexual) linhas.push('• Assédio sexual / briga / perseguição');
  if (d.desc_avaria) linhas.push('• Desconto por avaria');
  if (d.desc_multa) linhas.push('• Desconto por multa');
  if (d.desc_diferenca_roleta) linhas.push('• Diferença na roleta');
  if (d.acu_manobrista_dirigia || d.acu_mini_dirigia_micrao || d.acu_motorista_cobrava || d.acu_fiscal_despachante) {
    linhas.push('• Acúmulo de função');
  }
  linhas.push('');
  if (d.obs_geral) {
    linhas.push('--- OBSERVAÇÕES ---');
    linhas.push(d.obs_geral);
    linhas.push('');
  }

  linhas.push('--- ANEXOS ---');
  let n = 1;
  if (fotoCliente) linhas.push(n++ + '. foto_cliente.jpg');
  docs.forEach((doc) => {
    const desc = doc.descricao ? ' — ' + doc.descricao : '';
    linhas.push(n++ + '. doc_' + String(n - 1).padStart(2, '0') + '.jpg' + desc);
  });
  linhas.push('Total de anexos (fotos): ' + ((fotoCliente ? 1 : 0) + docs.length));
  linhas.push('');
  linhas.push('(ficha_dados.json em anexo — alimenta a calculadora Skynet)');
  linhas.push('(ficha_visual.doc em anexo — abrir no Word para consulta visual)');
  linhas.push('(PWA v' + est.metadata.versao_ficha + ')');
  return linhas.join('\n');
}

function nomeArquivoBase(d) {
  const limp = (s) => (s || '').replace(/[^A-Za-z0-9]+/g, '_').toUpperCase();
  return limp(d.rec_nome) + '_x_' + limp(d.emp_nome);
}

function gerarDocumentoWord(d, est) {
  const fmtData = (s) => {
    if (!s) return '—';
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? (m[3] + '/' + m[2] + '/' + m[1]) : s;
  };
  const fmtValor = (n) => {
    if (n === null || n === undefined || n === '') return '—';
    const num = typeof n === 'number' ? n : parseValorBrl(n);
    if (num === null || isNaN(num)) return '—';
    return 'R$ ' + num.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };
  const sn = (b) => b ? 'Sim' : 'Não';
  const ou = (s) => (s && String(s).trim()) ? escapeHtml(s) : '—';
  const oub = (s) => (s && String(s).trim()) ? escapeHtml(s).replace(/\n/g, '<br>') : '—';

  const danos = [];
  if (!d.tem_banheiro) danos.push('Falta de banheiro no posto — dano moral padrão R$ 10.000');
  if (!d.tem_bebedouro) danos.push('Falta de bebedouro no posto');
  if (d.troco_ofendido_passageiro) danos.push('Ofensa por passageiro por falta de troco — dano moral padrão R$ 10.000');
  if (d.dano_assedio_producao) danos.push('Assédio moral por produção');
  if (d.dano_levou_falta) danos.push('Sofreu falta/gancho por produção');
  if (d.dano_lista_exposta) danos.push('Nome exposto em lista' + (d.dano_lista_motivo ? ' (' + d.dano_lista_motivo + ')' : ''));
  if (d.dano_assedio_sexual) danos.push('Assédio sexual / briga / perseguição');

  const descontos = [];
  if (d.desc_avaria) descontos.push('Avaria');
  if (d.desc_multa) descontos.push('Multa');
  if (d.desc_diferenca_roleta) descontos.push('Diferença na roleta');

  const acumulo = [];
  if (d.acu_manobrista_dirigia) acumulo.push('Manobrista que dirigia ônibus na rua');
  if (d.acu_mini_dirigia_micrao) acumulo.push('Motorista mini/midi dirigindo MICRÃO');
  if (d.acu_motorista_cobrava) acumulo.push('Motorista que dirigia E cobrava');
  if (d.acu_fiscal_despachante) acumulo.push('Fiscal exercendo função de despachante');

  const docsDisp = [];
  if (d.doc_ctps) docsDisp.push('CTPS');
  if (d.doc_rg) docsDisp.push('RG');
  if (d.doc_cpf) docsDisp.push('CPF');
  if (d.doc_cnh) docsDisp.push('CNH');
  if (d.doc_holerites) docsDisp.push('Holerites');
  if (d.doc_cartao_ponto) docsDisp.push('Cartão de ponto');
  if (d.doc_escalas) docsDisp.push('Escalas');
  if (d.doc_trct) docsDisp.push('TRCT');
  if (d.doc_extrato_fgts) docsDisp.push('Extrato FGTS');
  if (d.doc_advertencias) docsDisp.push('Advertências');
  if (d.doc_contrato) docsDisp.push('Contrato');

  const linhasAnexos = [];
  if (fotoCliente) linhasAnexos.push('foto_cliente.jpg');
  docs.forEach((doc, idx) => {
    const num = String(idx + 1).padStart(2, '0');
    const desc = doc.descricao ? ' — ' + doc.descricao : '';
    linhasAnexos.push('doc_' + num + '.jpg' + desc);
  });

  const nomeUpper = escapeHtml((d.rec_nome || '—').toUpperCase());
  const empresaUpper = escapeHtml((d.emp_nome || '—').toUpperCase());

  const fotoBlock = fotoCliente
    ? '<div class="foto-cliente"><img src="' + fotoCliente.dataUrl + '" alt="cliente"><div class="foto-legenda">Foto do cliente</div></div>'
    : '';

  const alertaRJ = d.emp_recuperacao
    ? '<div class="alerta">⚠ EMPRESA EM RECUPERAÇÃO JUDICIAL — atenção especial</div>'
    : '';
  const alertaLide = d.emp_lide_simulada
    ? '<div class="alerta">⚠ EMPRESA INDICOU ADVOGADO PARA LIDE SIMULADA</div>'
    : '';

  const linhaJustaCausa = d.justa_causa_motivo
    ? '<tr><td class="label">Motivo alegado da justa causa</td><td>' + oub(d.justa_causa_motivo) + '</td></tr>'
    : '';

  let blocoAcumulo = '';
  if (acumulo.length) {
    blocoAcumulo = '<h2>4. ACÚMULO / DESVIO DE FUNÇÃO</h2>'
      + '<ul>' + acumulo.map(a => '<li>' + escapeHtml(a) + '</li>').join('') + '</ul>'
      + (d.acu_periodo ? '<p><b>Período:</b> ' + escapeHtml(d.acu_periodo) + '</p>' : '')
      + (d.acu_fiscal_freq ? '<p><b>Detalhe fiscal-despachante:</b> ' + escapeHtml(d.acu_fiscal_freq) + '</p>' : '')
      + (d.acu_outras_funcoes ? '<p><b>Outras funções não contratadas:</b> ' + oub(d.acu_outras_funcoes) + '</p>' : '');
  }

  let blocoDanos = '';
  if (danos.length || descontos.length || d.dano_assedio_detalhes || d.troco_valor_portava || d.desc_observacoes) {
    blocoDanos = '<h2>5. DANOS MORAIS / DESCONTOS / TROCO</h2>'
      + (danos.length ? '<p><b>Danos morais detectados:</b></p><ul>' + danos.map(x => '<li>' + escapeHtml(x) + '</li>').join('') + '</ul>' : '')
      + (descontos.length ? '<p><b>Descontos sofridos:</b></p><ul>' + descontos.map(x => '<li>' + escapeHtml(x) + '</li>').join('') + '</ul>' : '')
      + (d.desc_observacoes ? '<p><b>Observações sobre descontos:</b> ' + oub(d.desc_observacoes) + '</p>' : '')
      + ((d.troco_valor_portava || d.troco_fornecido_empresa) ? '<p><b>Troco:</b> empresa fornecia: ' + sn(d.troco_fornecido_empresa) + ' &nbsp;|&nbsp; valor portado: ' + fmtValor(d.troco_valor_portava) + '</p>' : '')
      + (d.dano_assedio_detalhes ? '<p><b>Detalhes do assédio / briga / perseguição:</b><br>' + oub(d.dano_assedio_detalhes) + '</p>' : '');
  }

  const blocoDocsDisp = docsDisp.length
    ? '<h2>7. DOCUMENTOS DISPONÍVEIS (Inventário)</h2><p>' + docsDisp.map(x => escapeHtml(x)).join(' &nbsp;•&nbsp; ') + '</p>'
    : '';

  const blocoObs = d.obs_geral ? '<h2>8. OBSERVAÇÕES GERAIS</h2><p>' + oub(d.obs_geral) + '</p>' : '';

  let blocoRel = '';
  if (d.rel_saude || d.rel_familia || d.rel_particularidades || d.rel_proximos_contatos) {
    blocoRel = '<h2>9. NOTAS PARA RELACIONAMENTO (uso interno do escritório)</h2><table>'
      + (d.rel_saude ? '<tr><td class="label">Saúde / medicamentos</td><td>' + oub(d.rel_saude) + '</td></tr>' : '')
      + (d.rel_familia ? '<tr><td class="label">Família</td><td>' + oub(d.rel_familia) + '</td></tr>' : '')
      + (d.rel_particularidades ? '<tr><td class="label">Particularidades</td><td>' + oub(d.rel_particularidades) + '</td></tr>' : '')
      + (d.rel_proximos_contatos ? '<tr><td class="label">Lembretes próximos contatos</td><td>' + oub(d.rel_proximos_contatos) + '</td></tr>' : '')
      + '</table>';
  }

  const blocoAnexos = linhasAnexos.length
    ? '<h2>ANEXOS RECEBIDOS NESTE EMAIL</h2><ul>' + linhasAnexos.map(a => '<li>' + escapeHtml(a) + '</li>').join('') + '</ul>'
    : '';

  const estilos = '@page{size:A4;margin:2cm 2cm}'
    + 'body{font-family:\'Calibri\',\'Arial\',sans-serif;font-size:10.5pt;color:#222;line-height:1.35}'
    + 'h1{color:#1a3a5c;font-size:16pt;margin:0 0 2pt 0;text-align:center;letter-spacing:1pt}'
    + 'h2{color:#1a3a5c;font-size:12pt;margin:14pt 0 4pt 0;padding-bottom:2pt;border-bottom:1pt solid #1a3a5c}'
    + '.subtitulo{text-align:center;font-size:9pt;color:#666;margin:0 0 12pt 0}'
    + '.cabecalho{background:#1a3a5c;color:#fff;padding:10pt 12pt;margin:0 0 10pt 0}'
    + '.cabecalho .nome{font-size:14pt;font-weight:bold}'
    + '.cabecalho .empresa{font-size:11pt;margin-top:2pt}'
    + '.cabecalho .meta{font-size:9pt;color:#cdd5e0;margin-top:4pt}'
    + 'table{border-collapse:collapse;width:100%;margin:4pt 0 8pt 0}'
    + 'td{border:0.5pt solid #aaa;padding:4pt 6pt;vertical-align:top}'
    + 'td.label{background:#eef0f4;font-weight:bold;width:32%;color:#1a3a5c}'
    + 'ul{margin:4pt 0 8pt 18pt;padding:0}li{margin:2pt 0}'
    + '.alerta{background:#fff3cd;border-left:4pt solid #d29c00;padding:6pt 10pt;margin:6pt 0;font-weight:bold;color:#6b4c00}'
    + '.foto-cliente{text-align:center;margin:10pt 0}'
    + '.foto-cliente img{max-width:200pt;border:1pt solid #999}'
    + '.foto-legenda{font-size:9pt;color:#666;margin-top:2pt}'
    + '.rodape{margin-top:18pt;padding-top:6pt;border-top:0.5pt solid #999;font-size:8pt;color:#777}'
    + '.tag-causa{background:#1a3a5c;color:#fff;padding:1pt 6pt;font-weight:bold}';

  const html = '<!DOCTYPE html>'
    + '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">'
    + '<head><meta charset="UTF-8">'
    + '<title>Ficha — ' + nomeUpper + ' x ' + empresaUpper + '</title>'
    + '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotPromptForConvert/></w:WordDocument></xml><![endif]-->'
    + '<style>' + estilos + '</style></head><body>'
    + '<h1>FICHA DE ATENDIMENTO</h1>'
    + '<div class="subtitulo">OAM ADVOGADOS — Direito Trabalhista Rodoviário</div>'
    + '<div class="cabecalho">'
    +   '<div class="nome">' + nomeUpper + '</div>'
    +   '<div class="empresa">vs. ' + empresaUpper + '</div>'
    +   '<div class="meta">Atendimento: ' + fmtData(d.data_atendimento)
    +     ' &nbsp;•&nbsp; Atendido por: ' + ou(d.adv_responsavel)
    +     ' &nbsp;•&nbsp; Origem: ' + ou(d.origem_cliente)
    +     (d.origem_detalhe ? ' (' + escapeHtml(d.origem_detalhe) + ')' : '')
    +   '</div></div>'
    + alertaRJ + alertaLide + fotoBlock
    + '<h2>1. RECLAMANTE — Qualificação</h2><table>'
    +   '<tr><td class="label">Nome completo</td><td>' + ou(d.rec_nome) + '</td></tr>'
    +   '<tr><td class="label">Apelido</td><td>' + ou(d.rec_apelido) + '</td></tr>'
    +   '<tr><td class="label">Como prefere ser chamado</td><td>' + ou(d.rel_como_chamar) + '</td></tr>'
    +   '<tr><td class="label">Data de nascimento</td><td>' + fmtData(d.rec_data_nasc) + '</td></tr>'
    +   '<tr><td class="label">Estado civil</td><td>' + ou(d.rec_estado_civil) + '</td></tr>'
    +   '<tr><td class="label">Nome da mãe</td><td>' + ou(d.rec_nome_mae) + '</td></tr>'
    +   '<tr><td class="label">RG</td><td>' + ou(d.rec_rg) + '</td></tr>'
    +   '<tr><td class="label">CPF</td><td>' + ou(d.rec_cpf) + '</td></tr>'
    +   '<tr><td class="label">PIS / PASEP</td><td>' + ou(d.rec_pis) + '</td></tr>'
    +   '<tr><td class="label">CTPS (nº/série)</td><td>' + ou(d.rec_ctps) + '</td></tr>'
    +   '<tr><td class="label">Telefones</td><td>' + ou(d.rec_telefones) + '</td></tr>'
    +   '<tr><td class="label">WhatsApp</td><td>' + ou(d.rec_whatsapp) + '</td></tr>'
    +   '<tr><td class="label">E-mail</td><td>' + ou(d.rec_email) + '</td></tr>'
    +   '<tr><td class="label">Endereço</td><td>' + ou(d.rec_endereco) + '</td></tr>'
    +   '<tr><td class="label">CEP</td><td>' + ou(d.rec_cep) + '</td></tr>'
    + '</table>'
    + '<h2>2. CONTRATO DE TRABALHO</h2><table>'
    +   '<tr><td class="label">Empresa (Reclamada)</td><td>' + ou(d.emp_nome) + '</td></tr>'
    +   '<tr><td class="label">Consórcio</td><td>' + ou(d.emp_consorcio) + (d.emp_cor_carro ? ' &nbsp;|&nbsp; cor: ' + escapeHtml(d.emp_cor_carro) : '') + '</td></tr>'
    +   '<tr><td class="label">Admissão</td><td>' + fmtData(d.adm_data) + '</td></tr>'
    +   '<tr><td class="label">Demissão</td><td>' + fmtData(d.dem_data) + '</td></tr>'
    +   '<tr><td class="label">Data da Baixa / TRCT</td><td>' + fmtData(d.trct_data) + '</td></tr>'
    +   '<tr><td class="label">Último salário</td><td>' + fmtValor(d.salario_base) + '</td></tr>'
    +   '<tr><td class="label">Função (CTPS)</td><td>' + ou(d.funcao_ctps) + '</td></tr>'
    +   '<tr><td class="label">Função real exercida</td><td>' + ou(d.funcao_real) + '</td></tr>'
    +   '<tr><td class="label">Motivo do desligamento</td><td><span class="tag-causa">' + ou(d.tipo_causa) + '</span></td></tr>'
    +   '<tr><td class="label">Linhas / itinerários</td><td>' + ou(d.linhas) + '</td></tr>'
    +   linhaJustaCausa
    +   '<tr><td class="label">Defesa por escrito (justa causa)</td><td>' + sn(d.defesa_escrita) + '</td></tr>'
    +   '<tr><td class="label">Aviso prévio</td><td>' + ou(d.aviso_previo) + (d.aviso_reducao ? ' &nbsp;|&nbsp; ' + escapeHtml(d.aviso_reducao) : '') + '</td></tr>'
    +   '<tr><td class="label">TRCT recebeu / trouxe</td><td>' + sn(d.trct_recebeu) + ' / ' + sn(d.trct_trouxe) + '</td></tr>'
    +   '<tr><td class="label">Trouxe contracheques</td><td>' + sn(d.contracheques_trouxe) + '</td></tr>'
    +   '<tr><td class="label">Acordo judicial no período</td><td>' + ou(d.acordo_judicial) + '</td></tr>'
    +   '<tr><td class="label">Situação atual</td><td>' + ou(d.situacao_atual) + (d.novo_emprego ? ' &nbsp;|&nbsp; ' + escapeHtml(d.novo_emprego) : '') + '</td></tr>'
    + '</table>'
    + '<h2>3. JORNADA DE TRABALHO</h2><table>'
    +   '<tr><td class="label">Escala</td><td>' + ou(d.jor_escala) + '</td></tr>'
    +   '<tr><td class="label">Turno</td><td>' + ou(d.jor_turno) + '</td></tr>'
    +   '<tr><td class="label">Períodos em cada turno</td><td>' + oub(d.jor_turnos_periodos) + '</td></tr>'
    +   '<tr><td class="label">Início (ponto/garagem)</td><td>' + ou(d.jor_pisa_ponto) + '</td></tr>'
    +   '<tr><td class="label">Término motorista (ponto)</td><td>' + ou(d.jor_termino_ponto) + '</td></tr>'
    +   '<tr><td class="label">Término cobrador (arrecadação)</td><td>' + ou(d.jor_termino_arrecadacao) + '</td></tr>'
    +   '<tr><td class="label">Fazia dobra</td><td>' + sn(d.jor_dobra) + (d.jor_dobra ? ' &nbsp;|&nbsp; ' + escapeHtml(d.jor_dobra_horario || '?') + ' (' + escapeHtml(String(d.jor_dobra_qtd || '?')) + 'x semana)' : '') + '</td></tr>'
    +   '<tr><td class="label">Domingos e feriados</td><td>' + ou(d.jor_domingos) + '</td></tr>'
    +   '<tr><td class="label">Trabalho noturno (22h–5h)</td><td>' + ou(d.jor_noturno) + '</td></tr>'
    +   '<tr><td class="label">Folgas semanais</td><td>' + ou(d.jor_folgas) + '</td></tr>'
    +   '<tr><td class="label">Intervalo de placa</td><td>' + sn(d.int_placa) + (d.int_almoco_horario ? ' &nbsp;|&nbsp; almoço: ' + escapeHtml(d.int_almoco_horario) : '') + '</td></tr>'
    +   '<tr><td class="label">Banheiro disponível</td><td>' + sn(d.tem_banheiro) + '</td></tr>'
    +   '<tr><td class="label">Bebedouro disponível</td><td>' + sn(d.tem_bebedouro) + '</td></tr>'
    + '</table>'
    + blocoAcumulo + blocoDanos
    + '<h2>6. VALE ALIMENTAÇÃO E FÉRIAS</h2><table>'
    +   '<tr><td class="label">Recebeu Sodexo / VA</td><td>' + sn(d.va_sodexo_recebeu) + '</td></tr>'
    +   '<tr><td class="label">VA cortado</td><td>' + sn(d.va_sodexo_cortado) + '</td></tr>'
    +   '<tr><td class="label">Valor mensal do VA</td><td>' + fmtValor(d.va_valor_mensal) + '</td></tr>'
    +   '<tr><td class="label">Tirou férias</td><td>' + sn(d.ferias_tirou) + '</td></tr>'
    +   '<tr><td class="label">Período / dias de férias</td><td>' + ou(d.ferias_periodo) + '</td></tr>'
    + '</table>'
    + blocoDocsDisp + blocoObs + blocoRel + blocoAnexos
    + '<div class="rodape">Gerado pela PWA Ficha OAM • versão ' + escapeHtml(est.metadata.versao_ficha)
    +   ' • em ' + escapeHtml(new Date().toLocaleString('pt-BR'))
    +   '<br>Os dados estruturados (calculadora Skynet) estão em <b>ficha_dados.json</b>, anexo separadamente.</div>'
    + '</body></html>';

  return new Blob(['﻿', html], { type: 'text/html' });
}

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
    const assunto = 'FICHA: ' + (d.rec_nome || '').toUpperCase() + ' x ' + (d.emp_nome || '').toUpperCase() + ' - ' + (d.data_atendimento || '');

    const arquivos = [];
    const jsonBlob = new Blob([JSON.stringify(est, null, 2)], { type: 'application/json' });
    arquivos.push(new File([jsonBlob], 'ficha_dados.json', { type: 'application/json' }));

    // MIME text/html para o Web Share API aceitar (msword é bloqueado)
    const wordBlob = gerarDocumentoWord(d, est);
    arquivos.push(new File([wordBlob], 'ficha_visual.doc', { type: 'text/html' }));

    if (fotoCliente) {
      arquivos.push(new File([fotoCliente.blob], 'foto_cliente.jpg', { type: 'image/jpeg' }));
    }

    docs.forEach((doc, idx) => {
      const num = String(idx + 1).padStart(2, '0');
      let nome = 'doc_' + num;
      if (doc.descricao) {
        const slug = doc.descricao.replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40);
        if (slug) nome += '_' + slug;
      }
      nome += '.jpg';
      arquivos.push(new File([doc.blob], nome, { type: 'image/jpeg' }));
    });

    const shareData = { title: assunto, text: corpo, files: arquivos };

    // ETAPA 1: tenta Web Share API
    if (navigator.canShare && navigator.canShare(shareData)) {
      hideOverlay();
      try {
        await navigator.share(shareData);
        showOverlay('✔ Compartilhamento concluído.\n\nNo Gmail: confira o destinatário (' + EMAIL_DESTINO + ') antes de enviar.', true);
        return;
      } catch (e) {
        if (e.name === 'AbortError') {
          hideOverlay();
          return;
        }
        console.warn('navigator.share falhou, usando fallback mailto+download:', e);
      }
    }

    // ETAPA 2: FALLBACK — download dos arquivos + mailto com destinatário
    hideOverlay();
    showOverlay(
      'Vou baixar os arquivos e abrir o Gmail com\n' +
      EMAIL_DESTINO + ' já preenchido como destinatário.\n\n' +
      'Depois é só anexar os arquivos da pasta "Downloads".'
    );
    await new Promise(r => setTimeout(r, 1500));

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

    const mailto = 'mailto:' + EMAIL_DESTINO + '?subject=' + encodeURIComponent(assunto) + '&body=' + encodeURIComponent(corpo);
    setTimeout(() => {
      hideOverlay();
      window.location.href = mailto;
    }, 1200);

  } catch (e) {
    hideOverlay();
    alert('Erro: ' + e.message);
  }
}

function showOverlay(msg, comBotao = false) {
  document.getElementById('overlay-msg').textContent = msg;
  document.getElementById('overlay').hidden = false;
  document.getElementById('btn-fechar-overlay').hidden = !comBotao;
}

function hideOverlay() {
  document.getElementById('overlay').hidden = true;
  document.getElementById('btn-fechar-overlay').hidden = true;
}
