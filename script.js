// Array combinado (carteira + mercado)
let carteiraCompleta = [];

const selectSetor = document.getElementById('filtro-setor');
const selectOrdem = document.getElementById('ordenar-por');
const containerCards = document.getElementById('card-container');

// ---------- Utilitários ----------
function formatarMoeda(valor) {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarPercentual(valor) {
    return valor.toFixed(2) + '%';
}

// Converte para número; retorna 0 se for "-" ou inválido
function paraNumero(valor) {
    const n = Number(valor);
    if (isNaN(n)) {
        return 0;
    }
    return n;
}

// ---------- Fase 1: carregamento ----------
async function carregarDados() {
    try {
        const respCarteira = await fetch('json/carteira.json');
        const respApi = await fetch('json/api_fii.json');

        const carteira = await respCarteira.json();
        const api = await respApi.json();

        combinarDados(carteira, api);
        calcularKPIs();
        preencherSetores();
        atualizarTela();
    } catch (erro) {
        containerCards.innerHTML =
            '<p class="sem-resultado">Erro ao carregar os dados. ' +
            'Abra o projeto por um servidor local (ex.: Live Server do VS Code).</p>';
        console.error(erro);
    }
}

// Procura o fundo de mercado correspondente usando for
// ("bcri" na carteira corresponde a "BCRI11" na API)
function encontrarFundoNaApi(listaApi, codigo) {
    const sigla = codigo.toUpperCase();
    for (let i = 0; i < listaApi.length; i++) {
        const nomeApi = listaApi[i].fundo.toUpperCase();
        if (nomeApi.substring(0, sigla.length) === sigla) {
            return listaApi[i];
        }
    }
    return null;
}

function combinarDados(carteira, api) {
    const fundosCarteira = carteira.dados_investimentos.detalhes_fundos;
    const fundosApi = api.detalhes;

    carteiraCompleta = [];

    for (let i = 0; i < fundosCarteira.length; i++) {
        const item = fundosCarteira[i].fundo;
        const mercado = encontrarFundoNaApi(fundosApi, item.codigo);

        if (mercado === null) {
            continue; // fundo sem dados de mercado
        }

        const quantidade = item.informacoes.quantidade;
        const precoMedio = item.informacoes.preco_medio;
        const valorAtual = mercado.valorAtual;

        // Provento: próximo rendimento; se não existir (0 ou "-"), usa o último
        let origem = mercado.proximoRendimento;
        let provento = paraNumero(origem ? origem.rendimento : 0);
        if (provento === 0) {
            origem = mercado.ultimoRendimento;
            provento = paraNumero(origem.rendimento);
        }

        const pctCota = (provento / valorAtual) * 100;
        const pctMedio = (provento / precoMedio) * 100;

        carteiraCompleta.push({
            sigla: item.codigo.toUpperCase(),
            segmento: mercado.segmento,
            quantidade: quantidade,
            precoMedio: precoMedio,
            valorAtual: valorAtual,
            totalInvestido: quantidade * precoMedio,
            dy: mercado.dividendYield,
            pvp: mercado.pvp,
            rendMedio24m: mercado.rendimentoMedio24M,
            provento: provento,
            dataBase: origem.dataBase,
            dataPag: origem.dataPag,
            pctCota: pctCota,
            classeCota: pctCota >= 0.90 ? 'positivo' : 'negativo',
            pctMedio: pctMedio,
            classeMedio: pctMedio >= 0.90 ? 'positivo' : 'negativo'
        });
    }
}

// ---------- KPIs ----------
function calcularKPIs() {
    let totalInvestido = 0;
    let valorAtualCarteira = 0;
    let proventosMes = 0;
    let somaPercentuais = 0;

    for (let i = 0; i < carteiraCompleta.length; i++) {
        const f = carteiraCompleta[i];
        totalInvestido += f.quantidade * f.precoMedio;
        valorAtualCarteira += f.quantidade * f.valorAtual;
        proventosMes += f.quantidade * f.provento;
        somaPercentuais += f.pctCota;
    }

    let rendimentoMedio = 0;
    if (carteiraCompleta.length > 0) {
        rendimentoMedio = somaPercentuais / carteiraCompleta.length;
    }

    document.getElementById('kpi-investido').textContent = formatarMoeda(totalInvestido);
    document.getElementById('kpi-atual').textContent = formatarMoeda(valorAtualCarteira);
    document.getElementById('kpi-proventos').textContent = formatarMoeda(proventosMes);
    document.getElementById('kpi-rendimento').textContent = formatarPercentual(rendimentoMedio);
}

// ---------- Controles ----------
function preencherSetores() {
    const setores = [];

    for (let i = 0; i < carteiraCompleta.length; i++) {
        const segmento = carteiraCompleta[i].segmento;
        let jaExiste = false;

        for (let j = 0; j < setores.length; j++) {
            if (setores[j] === segmento) {
                jaExiste = true;
                break;
            }
        }
        if (!jaExiste) {
            setores.push(segmento);
        }
    }

    for (let i = 0; i < setores.length; i++) {
        const opcao = document.createElement('option');
        opcao.value = setores[i];
        opcao.textContent = setores[i];
        selectSetor.appendChild(opcao);
    }
}

function filtrarPorSetor(setor) {
    const resultado = [];
    for (let i = 0; i < carteiraCompleta.length; i++) {
        if (setor === 'todos' || carteiraCompleta[i].segmento === setor) {
            resultado.push(carteiraCompleta[i]);
        }
    }
    return resultado;
}

// Retorna true se "a" deve vir antes de "b" no critério escolhido
function vemAntes(a, b, criterio) {
    if (criterio === 'rendimento') return a.pctCota > b.pctCota;
    if (criterio === 'dy') return a.dy > b.dy;
    if (criterio === 'pvp') return a.pvp < b.pvp;
    return a.sigla < b.sigla; // nome A-Z
}

// Insertion sort feito à mão (sem .sort)
function ordenar(lista, criterio) {
    for (let i = 1; i < lista.length; i++) {
        const atual = lista[i];
        let j = i - 1;
        while (j >= 0 && vemAntes(atual, lista[j], criterio)) {
            lista[j + 1] = lista[j];
            j--;
        }
        lista[j + 1] = atual;
    }
    return lista;
}

// ---------- Exibição ----------
function criarCard(f) {
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML =
        '<div class="card-header ' + f.classeCota + '">' +
            '<h2>' + f.sigla + '</h2>' +
            '<span>' + f.segmento + '</span>' +
        '</div>' +
        '<div class="card-body">' +
            '<div class="info"><small>Qtd. Cotas</small><strong>' + f.quantidade + '</strong></div>' +
            '<div class="info"><small>Total Investido</small><strong>' + formatarMoeda(f.totalInvestido) + '</strong></div>' +
            '<div class="info"><small>Preço Médio</small><strong>' + formatarMoeda(f.precoMedio) + '</strong></div>' +
            '<div class="info"><small>Cotação Atual</small><strong>' + formatarMoeda(f.valorAtual) + '</strong></div>' +
            '<div class="info"><small>DY (12m)</small><strong>' + formatarPercentual(f.dy) + '</strong></div>' +
            '<div class="info"><small>Rend. Médio (24m)</small><strong>' + formatarMoeda(f.rendMedio24m) + '</strong></div>' +
        '</div>' +
        '<div class="card-footer">' +
            '<div class="linha-datas">' +
                '<div><small>Data Base</small><strong>' + f.dataBase + '</strong></div>' +
                '<div><small>Pagamento</small><strong>' + f.dataPag + '</strong></div>' +
            '</div>' +
            '<div class="linha-rendimentos">' +
                '<div class="caixa ' + f.classeCota + '">Rend. (Cota)' +
                    '<strong>' + formatarMoeda(f.provento) + '</strong>' +
                    '<strong>' + formatarPercentual(f.pctCota) + '</strong></div>' +
                '<div class="caixa ' + f.classeMedio + '">Rend. (P. Médio)' +
                    '<strong>' + formatarMoeda(f.provento) + '</strong>' +
                    '<strong>' + formatarPercentual(f.pctMedio) + '</strong></div>' +
            '</div>' +
        '</div>';
    return card;
}

function atualizarTela() {
    const filtrados = filtrarPorSetor(selectSetor.value);
    const ordenados = ordenar(filtrados, selectOrdem.value);

    containerCards.innerHTML = ''; // limpa o container

    if (ordenados.length === 0) {
        containerCards.innerHTML = '<p class="sem-resultado">Nenhum fundo encontrado.</p>';
        return;
    }

    for (let i = 0; i < ordenados.length; i++) {
        containerCards.appendChild(criarCard(ordenados[i]));
    }
}

// ---------- Eventos ----------
selectSetor.addEventListener('change', atualizarTela);
selectOrdem.addEventListener('change', atualizarTela);

carregarDados();