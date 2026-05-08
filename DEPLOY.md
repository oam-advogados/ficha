# DEPLOY DA PWA — Passo a Passo

Como publicar a Ficha OAM no GitHub Pages para a recepcionista
acessar pelo Chrome do Android. Tempo total: ~10 minutos.
Sem programação, sem terminal — só clicar em botões.

---

## PASSO 1 — Criar conta no GitHub (3 min)

1. Abra o navegador no computador e vá em **https://github.com**
2. Clique no botão **"Sign up"** (canto superior direito)
3. Preencha:
   - **Email**: pode ser `oamcybernet@gmail.com`
   - **Password**: crie uma senha forte (anote em local seguro)
   - **Username**: sugestão `oam-advogados`. Se estiver indisponível, tente `oamadvocacia`, `oamadv-rj`, `escritorio-oam`. **Anote o nome que ficou.**
4. O GitHub manda um email com código de verificação. Confira a caixa do
   `oamcybernet@gmail.com`, copie o código, cole na tela do GitHub.
5. Pode pular as perguntas opcionais ("How would you describe your level
   of programming experience?" → coloque o que quiser ou pule).
6. Pronto. O senhor está logado.

---

## PASSO 2 — Criar o repositório (1 min)

Repositório é uma "pasta" no GitHub onde os arquivos do site vão ficar.

1. No canto superior direito, clique no **+** e escolha **"New repository"**.
2. **Repository name**: digite `ficha`
3. **Description** (opcional): "Ficha de atendimento OAM Advogados"
4. Selecione **Public** (precisa ser público para o GitHub Pages grátis funcionar; mas o conteúdo é só o formulário em branco, sem dados de cliente)
5. **NÃO** marque "Add a README file"
6. Clique em **"Create repository"** (botão verde no fim)

---

## PASSO 3 — Subir os arquivos da PWA (2 min)

1. Na página que abrir, procure o link em azul:
   **"uploading an existing file"** (no meio da tela, dentro do quadro
   "Quick setup"). Clique nele.

2. Aparece uma área tracejada com o texto **"Drag files here..."**.

3. **Abra o Explorer do Windows** e navegue até:
   ```
   C:\Dropbox\SKYNETLAB\SKYNET 2026\SKILL_RODOVIARIO\_FERRAMENTAS\PWA_FichaOAM\
   ```

4. **Selecione TODOS os arquivos e a pasta `icons`** dentro dessa pasta:
   - `index.html`
   - `style.css`
   - `app.js`
   - `manifest.json`
   - `sw.js`
   - `DEPLOY.md` (este arquivo, opcional subir)
   - pasta `icons/` (com os 3 PNGs dentro)

5. **Arraste tudo de uma vez** para a área tracejada do GitHub.

6. Aguarde os uploads terminarem (barra de progresso por arquivo).

7. No final da página, no quadro **"Commit changes"**:
   - Pode deixar a mensagem padrão
   - Selecione **"Commit directly to the main branch"**
   - Clique em **"Commit changes"** (botão verde)

---

## PASSO 4 — Ativar o GitHub Pages (1 min)

Agora vamos transformar os arquivos em um site público.

1. No topo da página do repositório, clique em **"Settings"** (engrenagem,
   à direita das abas Code/Issues/Pull requests/etc.).

2. No menu lateral esquerdo, clique em **"Pages"**.

3. Em **"Build and deployment" → "Source"**, escolha **"Deploy from a branch"**.

4. Em **"Branch"**, escolha **"main"** e a pasta **"/ (root)"**.

5. Clique em **"Save"**.

6. Aguarde **2 minutos**. Recarregue a página. Aparece no topo:

   > **Your site is live at https://oam-advogados.github.io/ficha/**

   (substitua `oam-advogados` pelo username que o senhor escolheu)

7. **Anote essa URL.** É o endereço que a recepcionista vai usar.

---

## PASSO 5 — Testar no celular Android (2 min)

1. Pegue o celular Android.
2. Abra o **Chrome**.
3. Digite a URL anotada (ex: `https://oam-advogados.github.io/ficha/`).
4. A ficha deve carregar.
5. Toque no botão **⋮** (três pontinhos) no canto superior direito do Chrome.
6. Escolha **"Adicionar à tela inicial"** (ou "Instalar app", o nome varia).
7. Confirme. O ícone "Ficha OAM" aparece na tela inicial do celular.
8. Toque no ícone para abrir.
9. **Pronto.** Funciona como app.

---

## PASSO 6 — Distribuir para o pessoal do escritório

Mande a URL para todas as pessoas que fazem atendimento. Cada um faz
o passo 5 no próprio celular Android. Não precisa de senha, login,
nem instalação de loja — é só abrir a URL.

---

## ATUALIZAÇÕES FUTURAS

Quando precisar mudar alguma coisa na ficha (acrescentar campo, mudar
texto, etc.):

1. Eu (Claude) edito os arquivos na sua pasta do Dropbox.
2. O senhor entra no repositório no GitHub.
3. Vai em "Add file → Upload files" novamente.
4. Arrasta os arquivos novos (substituem os antigos).
5. Commit.
6. Em ~2 minutos, todos os celulares do escritório recebem a atualização
   automaticamente da próxima vez que abrirem a PWA com internet.

Sem nenhum aviso de "tem update", sem PlayStore. O site fica
permanentemente atualizado.

---

## PROBLEMAS COMUNS

**"Username já está em uso"** → tente outro: `oamadv`, `oam-rj`,
`escritorio-oam-adv`, `oamadvocacia-rj`, etc.

**"O site não carrega após ativar Pages"** → aguarde mais 5 minutos.
A primeira ativação demora um pouco. Tente também limpar o cache do
navegador (Ctrl+F5).

**"Adicionar à tela inicial não aparece"** → o site precisa ter sido
acessado pelo menos uma vez antes do Chrome oferecer a opção. Atualize
a página ou tente em modo anônimo primeiro.

**"O ícone na tela inicial é genérico"** → atualize a página da PWA
uma vez online após a instalação. O service worker pega os ícones
corretos depois do primeiro uso.

---

## TESTE FINAL — RECEBER UM EMAIL DE TESTE

Para o senhor confirmar que está tudo certo antes de a recepcionista usar:

1. Abra a PWA no celular pelo ícone na tela.
2. Preencha apenas os campos obrigatórios (com *):
   - Nome: TESTE DA SILVA
   - Empresa: EMPRESA TESTE
   - Data de admissão: qualquer data
   - Motivo: Sem justa causa
3. Tire uma foto qualquer (rosto seu serve).
4. Tire uma foto de qualquer documento como teste.
5. Toque em **"Enviar por email"**.
6. O Android abre o menu de compartilhamento → escolha **Gmail**.
7. O Gmail abre **já preenchido** com:
   - Para: oamcybernet@gmail.com
   - Assunto: FICHA: TESTE DA SILVA x EMPRESA TESTE - DD/MM/YYYY
   - Anexos: ficha_dados.json, foto_cliente.jpg, doc_01.jpg
8. Toque em **Enviar**.
9. Confirme no `oamcybernet@gmail.com` que o email chegou direitinho.

Se chegou: **está tudo funcionando**. Pode liberar para o pessoal.
