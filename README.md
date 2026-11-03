# Robô B3

Site pessoal para acompanhar uma carteira de renda na B3 (ações e fundos imobiliários), com **sincronização entre celular e computador**.

## O que tem aqui

| Pasta / arquivo | Para que serve |
|---|---|
| `public/` | O site (um `index.html`, ícones e `manifest`). **Não tem nenhum dado pessoal**: seus dados ficam no navegador de cada aparelho e, com a sincronização ligada, numa cópia privada no próprio Netlify. |
| `netlify/functions/sync.mjs` | A função de sincronização (endereço `/api/sync`). Guarda a cópia no Netlify Blobs do site. A chave nunca é gravada: só o *hash* dela vira o nome do arquivo na nuvem. |
| `netlify.toml`, `package.json` | Configuração do Netlify (pasta `public`, pasta das funções, Node 22). |

## Publicar no Netlify (uma vez só)

A função de sincronização só é publicada quando o site vem do GitHub (arrastar uma pasta ou um zip publica só o site, sem a função).

1. No Netlify, abra o site **roboregrasb3**.
2. Vá em **Project configuration → Developer settings → Continuous deployment → Repository → Link repository**.
3. Escolha **GitHub**, autorize o Netlify a ler este repositório (`robo-b3`) e selecione-o.
4. Branch: `main`. Deixe o *build command* vazio. O `netlify.toml` já informa a pasta `public` e a pasta `netlify/functions`.
5. Salve e espere o *deploy* ficar **Published**. O endereço do site continua o mesmo, e os dados que já estão no seu navegador não mudam.

Depois disso, cada alteração enviada para o `main` é publicada sozinha.

## Conectar o celular e o computador

1. No aparelho que tem os dados certos, abra o site, vá em **Sincronizar celular e computador** e toque em **Ativar sincronização**.
2. Toque em **Copiar link** (ou **Enviar link**) e mande o link para você mesmo (WhatsApp, e-mail ou Notas).
3. No outro aparelho, abra o link e toque em **Sim, conectar** (ou **Juntar e conectar**, se ele já tiver dados). Se o link não abrir dentro do app instalado na tela inicial, cole-o no campo **Já ativou em outro aparelho?** do mesmo bloco.

Depois de conectado, o que você muda num aparelho aparece no outro em cerca de 1 minuto.

**Atenção:** quem tiver o link vê e muda seus dados. Não compartilhe. A chave da brapi (preços automáticos) fica só no aparelho onde foi digitada e não é sincronizada.

## Mostrar a carteira para outra pessoa (só ver)

Para outra pessoa avaliar o site **com os seus dados**, sem poder mudar nada seu:

1. Com a sincronização ligada, abra o bloco **Mostrar a carteira para outra pessoa (só ver)** e toque em **Criar link para só ver**.
2. Toque em **Enviar link** (ou **Copiar link**) e mande para a pessoa. O link termina em `#ver=…`.
3. Ela abre o link no navegador dela. O site baixa uma **cópia** da carteira e mostra um aviso no topo ("Você está vendo uma cópia"). Ela pode testar tudo: o que ela mexer fica **só no navegador dela**, num espaço separado, e nunca volta para você.
4. Depois de mudar algo, toque em **Atualizar o que ela vê**; ela toca em **Atualizar a cópia** para receber a versão nova.
5. Para encerrar, toque em **Parar de compartilhar**: o link deixa de funcionar na hora.

O que vai na cópia: ações e fundos, rendimentos, dados de cada investimento, preços e regras. **Não vão**: o diário (anotações), a chave de sincronização e a chave da brapi.

Regras de segurança:

- A chave do link (`#ver=`) é **outra** chave, gerada pelo servidor. Ela só serve para **ler** a cópia: não sincroniza, não apaga e não compartilha. O servidor guarda só o *hash* dela.
- O link vale por **30 dias desde a última atualização**. Parar de compartilhar, apagar a cópia na nuvem ou desligar a sincronização (neste último caso o site para o link antes) também encerram o link.
- Quem recebe o link e já tem dados próprios no navegador é perguntada antes; os dados dela não são tocados e ela volta a eles em **Sair da visualização**.
- **Nunca** envie o link de sincronização (`#sync=…`) nem o link de recuperação (`#restaurar=…`): eles dão acesso aos seus dados.

## Como funciona

- Cada aparelho guarda seus dados no navegador e envia as mudanças para `/api/sync`, que junta tudo documento por documento. Se o mesmo item for mudado nos dois aparelhos, vale a edição mais recente.
- Apagar um item vira uma "lápide" na nuvem, para a exclusão chegar aos outros aparelhos (lápides com mais de 120 dias são limpas).
- Limites: 4.000 documentos e 2,5 MB por grupo; um documento tem no máximo 60 mil caracteres.
- Link só para ver: uma cópia por grupo, com até 1.500 documentos e 600 mil caracteres; vale 30 dias desde a última atualização (`share`, `view` e `unshare` em `/api/sync`; blocos `p/` e `s/`).
- Em Netlify, a função usa `@netlify/blobs` com leitura forte e gravação condicional (sem perder edição quando dois aparelhos enviam ao mesmo tempo).

## Testes

Os testes automáticos (função de sincronização e dois aparelhos simulados em navegador) rodaram antes da publicação e não fazem parte deste repositório.
