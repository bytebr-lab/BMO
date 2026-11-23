# Portal BMO — Versão Modular Completa

Portal institucional e ambiente interno da **Banda Milícia Odivelense**, reestruturado em arquitetura modular com **HTML5, CSS3, JavaScript (ES Modules) e Firebase (Authentication + Cloud Firestore)**.

## Estrutura de Pastas e Arquivos

```text
portal-bmo/
├── index.html              # Página pública institucional (Início, A banda, Notícias, Agenda, Contato)
├── login.html              # Autenticação e recuperação de senha
├── solicitar-acesso.html   # Formulário de solicitação de cadastro (cria conta pendente)
├── painel.html             # Área restrita (+ Gerenciar Cursos, Gerenciar Corpo Musical, Inscrições e Mensagens)
├── pre-inscricao.html      # Formulário público de pré-inscrição (sem login)
├── corpo-musical.html      # Página pública dos integrantes por naipe
├── css/
│   └── styles.css          # Identidade visual e responsividade de todas as páginas
├── js/
│   ├── firebase-config.js  # Inicialização centralizada do Firebase App, Auth e Firestore
│   ├── public.js           # Carregamento dinâmico de notícias e eventos públicos
│   ├── login.js            # Fluxo de login, validação de conta ativa e redefinição de senha
│   ├── signup.js           # Criação de conta no Auth + registro pendente no Firestore
│   └── dashboard.js        # Lógica completa do painel (CRUD, filtros, frequência e aprovação de usuários)
├── assets/
│   └── brasao-bmo.jpg      # Brasão oficial da Banda Milícia Odivelense
├── firestore.rules         # Regras de segurança do Cloud Firestore
├── .gitignore
└── README.md
```

## Como executar no VS Code
1. Extraia o arquivo ZIP e abra a pasta `portal-bmo` no VS Code (**Arquivo > Abrir Pasta**).
2. Instale a extensão **Live Server** (Ritwick Dey).
3. Clique com o botão direito em `index.html` e selecione **Open with Live Server**.
4. **Importante:** Não abra os arquivos HTML por duplo clique (`file://`), pois os módulos JavaScript (`type="module"`) exigem um servidor HTTP local.

## Configuração do Firebase
1. Acesse o [Firebase Console](https://console.firebase.google.com/) no projeto `portal-bmo` (ou substitua as chaves em `js/firebase-config.js` caso crie outro projeto).
2. Em **Authentication > Sign-in method**, certifique-se de que **E-mail/senha** está ativado.
3. Em **Firestore Database > Regras**, cole o conteúdo do arquivo `firestore.rules` e clique em **Publicar**.
4. Para promover o primeiro **Administrador**:
   - Cadastre-se pela página `solicitar-acesso.html`.
   - No Firebase Console, acesse **Firestore Database > `usuarios`** e localize o documento com o UID do usuário.
   - Altere `perfil` para `administrador` e `ativo` para `true`.
   - Faça login em `login.html` para gerenciar os demais usuários diretamente pelo painel.

## Coleções do Firestore
- `usuarios`: `nome`, `email`, `telefone`, `instrumento`, `perfil`, `perfilSolicitado`, `observacao`, `ativo`, `criadoEm`.
- `noticias`: `titulo`, `conteudo`, `publicada`, `autor`, `criadoEm`.
- `eventos`: `titulo`, `data`, `local`, `descricao`, `publico`, `criadoPor`, `criadoEm`.
- `repertorio`: `titulo`, `compositor`, `categoria`, `observacoes`, `criadoPor`, `criadoEm`.
- `turmas`: `nome`, `instrumento`, `horario`, `professor`, `criadoPor`, `criadoEm`.
- `frequencias`: `alunoUid`, `alunoNome`, `turma`, `situacao`, `registradoPor`, `data`, `criadoEm`.

## Expansão (Formação Musical, Corpo Musical, Contato)
Novos módulos JS: `site-config.js` (WhatsApp, Instagram, URL externa de matrícula), `utils.js`, `naipes.js`, `formacao.js`, `pre-inscricao.js`, `corpo-musical.js`, `contato.js`, `links-institucionais.js`, `dashboard-extras.js` (painel do administrador).
Novas coleções: `cursos`, `corpo_musical`, `inscricoes`, `mensagens`.
- `cursos`: `nome`, `apresentacao`, `historia`, `caracteristicas`, `faixaEtaria`, `requisitos`, `imagem`, `ordem`, `ativo`, `inscricoesAbertas`, `etapaPosterior`, `criadoPor`, `criadoEm`.
- `corpo_musical`: `nome`, `instrumento`, `naipe`, `funcao`, `foto`, `ativo`, `criadoPor`, `criadoEm`.
- `inscricoes`: `tipo`, `nome`, `dataNascimento`, `telefone`, `whatsapp`, `cursoId`, `cursoNome`, `mensagem`, `status`, `criadoEm`.
- `mensagens`: `tipo`, `nome`, `contato`, `assunto`, `mensagem`, `status`, `criadoEm`.
Publique novamente o `firestore.rules` após atualizar. Imagens são reduzidas no navegador e guardadas como texto no Firestore (não usa Firebase Storage).

## PDFs do repertório no Google Drive

O envio de PDFs do repertório foi integrado ao Google Drive. O primeiro envio cria automaticamente a pasta **Portal BMO - Partituras** na conta Google autorizada pelo administrador. Os arquivos recebem permissão de visualização por link para que músicos sem acesso administrativo possam abrir as partituras. O Firestore guarda o link, o nome e o ID do arquivo; imagens e os demais módulos continuam usando a configuração atual.

### Configuração obrigatória (uma única vez)
1. No [Google Cloud Console](https://console.cloud.google.com/), selecione/crie um projeto e ative **Google Drive API** em APIs e serviços > Biblioteca.
2. Em **Google Auth Platform**, configure a tela de consentimento OAuth. Adicione a conta Google administradora como usuário de teste enquanto o app estiver em modo de teste.
3. Em Clientes, crie um ID OAuth do tipo **Aplicativo da Web**.
4. Em **Origens JavaScript autorizadas**, cadastre `https://bytebr-lab.github.io` para o GitHub Pages (sem `/BMO/` ou barra final). Para testes locais, adicione também `http://127.0.0.1:5500` e `http://localhost:5500` somente se essas forem as origens usadas no Live Server. Não coloque caminhos como `/painel.html`, apenas a origem.
5. Copie o Client ID e cole em `js/google-drive.js`, substituindo `COLE_AQUI_SEU_CLIENT_ID.apps.googleusercontent.com`.
6. Publique os arquivos atualizados do portal. Entre com a conta administradora e envie um PDF de teste. O Google abrirá a autorização; aceite com a conta que será dona da pasta.

**Atenção:** a integração pede o escopo `drive.file`, não a senha da conta nem acesso geral ao Drive. A permissão `qualquer pessoa com o link - leitor` é aplicada aos PDFs para permitir a leitura no portal. Se a conta Google for de uma organização que bloqueia compartilhamento público, o administrador do Google Workspace precisará liberar essa política. O Google pode exigir configuração/verificação OAuth conforme o tipo de conta e publicação do aplicativo.

PDFs antigos que ainda tenham `arquivoPath` no Firebase Storage continuam abrindo normalmente. Ao substituir ou excluir esses registros pelo painel, o portal também tenta remover o arquivo antigo do Storage.
