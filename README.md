# M535 Remap

Alternativa leve ao Logi Options/Options+ para o **Logitech M535 Bluetooth Mouse** no **macOS (Apple Silicon)**.
Remapeia o botão de gestos, o tilt da roda e o clique na roda sem os drivers da Logitech, com uma interface
visual para configurar ações e perfis por aplicativo.

São dois apps:

| App | Papel |
|---|---|
| **M535 Remap Helper** | Helper nativo em Swift na barra de menus. Fala com o mouse via HID++ e executa as ações. Leve, roda sempre. |
| **M535 Remap** | Interface Electron para configurar. Só precisa estar aberta enquanto você configura. |

---

## Sumário

- [Recursos](#recursos)
- [Requisitos](#requisitos)
- [Instalação](#instalação)
- [Permissões do macOS](#permissões-do-macos)
- [Uso](#uso)
- [Configuração (`config.json`)](#configuração-configjson)
- [Desinstalação](#desinstalação)
- [Desenvolvimento](#desenvolvimento)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Como funciona](#como-funciona)
- [Diagnóstico do mouse](#diagnóstico-do-mouse)
- [Solução de problemas](#solução-de-problemas)
- [Limitações](#limitações)

---

## Recursos

- **Botão de gestos** (o botão pequeno atrás da roda): clique + 4 direções (segure e mova o mouse), cada um com sua ação.
- **Tilt ← / →** da roda, com repetição opcional enquanto inclinado.
- **Clique na roda**: nativo por padrão, ou remapeável.
- **Tipos de ação**: ação do sistema (24 prontas: Mission Control, App Exposé, Spaces, Voltar/Avançar, mídia, volume,
  abas, captura de tela…), atalho de teclado, abrir app (com opção de ocultar se já estiver na frente),
  abrir link/arquivo/pasta e comando shell.
- **Perfis por aplicativo**, herdando do perfil Padrão o que não for personalizado.
- **Diagrama interativo** do M535 com destaque ao vivo de todos os controles (inclusive esquerdo, direito e rolagem).
- **Tema claro/escuro** seguindo o macOS.
- O mouse **volta ao padrão de fábrica** sempre que o helper é encerrado ou pausado.

### Ações padrão

| Controle | Ação |
|---|---|
| Gestos: clique | Mission Control |
| Gestos: ↑ | Mission Control |
| Gestos: ↓ | Janelas do app (App Exposé) |
| Gestos: ← / → | Desktop anterior / próximo (Spaces) |
| Tilt ← / → | Voltar / Avançar (⌘[ / ⌘]) |
| Clique na roda | Clique do meio nativo |

---

## Requisitos

- macOS 13 ou superior, Apple Silicon (arm64)
- Logitech M535 pareado por Bluetooth (VID `046D`, PID `B016`)
- Xcode Command Line Tools (`xcode-select --install`), para o `swift`
- Node.js 22+ e npm 11+

---

## Instalação

### 1. Certificado de assinatura (uma única vez)

```bash
scripts/create-signing-cert.sh
```

Cria um certificado autoassinado `M535Remap Local Signing` no seu Keychain e pede sua senha para confiar nele
para assinatura de código. **Por que:** o macOS associa as permissões de Acessibilidade e Monitoramento de Entrada
à assinatura do app. Com a assinatura ad-hoc padrão, elas seriam perdidas a cada rebuild. Não é preciso conta de
desenvolvedor Apple — o app só roda na sua máquina.

> No primeiro build o macOS pode perguntar se o `codesign` pode usar a chave: escolha **Sempre Permitir**.

### 2. Dependências da interface

```bash
cd app
npm install
```

### 3. Gerar e instalar o app

```bash
cd app
npm run package
```

Isso compila o helper, a interface, empacota tudo em `build/` e instala **`~/Applications/M535 Remap.app`**
(com o helper embutido). Abra o app: ele mostra **"Instalar helper"** no topo — clique para instalar e iniciar
o **M535 Remap Helper**.

Alternativa pelo terminal (instala/atualiza só o helper e o reinicia):

```bash
scripts/build-helper.sh --install
```

### 4. Permissões

Conceda as permissões ao **M535 Remap Helper** (veja abaixo). Pronto: o ícone do mouse aparece na barra de menus.

---

## Permissões do macOS

O **helper** precisa de duas permissões, em **Ajustes do Sistema → Privacidade e Segurança**:

| Permissão | Para quê |
|---|---|
| **Monitoramento de Entrada** | Abrir o mouse via IOHID e receber os eventos do botão de gestos/tilt |
| **Acessibilidade** | Enviar atalhos de teclado, cliques e teclas de mídia sintéticos |

O helper pede as duas ao iniciar. Se o ícone na barra de menus mostrar ⚠︎, use as opções do menu
(**Conceder Monitoramento de Entrada…**, **Conceder Acessibilidade…**) e depois **Reiniciar para aplicar permissões**.
Se o app não aparecer na lista, clique em **+** e escolha `~/Applications/M535 Remap Helper.app`.

A interface (M535 Remap) **não** precisa de nenhuma permissão.

---

## Uso

### Interface

- **Diagrama**: clique num controle para editá-lo. Ao usar o mouse, o controle acende na tela
  (e é selecionado, se "Selecionar ao pressionar" estiver ativo nos Ajustes).
- **Pad de gestos**: escolha o clique ou uma das 4 direções do botão de gestos.
- **Editor**: escolha o tipo de ação, veja a prévia do que acontece e use **Testar ação**.
  - *Atalho*: clique em **Gravar atalho** e pressione as teclas (Esc cancela).
  - *App*: **Escolher…** abre o seletor de aplicativos.
- **Perfis**: **Perfil para um app…** cria um perfil ativo quando aquele app está em primeiro plano. Controles não
  personalizados usam o Padrão; **Herdar do Padrão** desfaz uma personalização.
- **Ajustes**: pausar o remapeamento, iniciar com o macOS, sensibilidade do gesto, repetição do tilt, log,
  instalação/atualização do helper e desinstalação.

Tudo é salvo automaticamente; o helper aplica as mudanças na hora.

### Menu da barra (helper)

Mostra conexão e bateria do mouse e o perfil ativo, e permite pausar o remapeamento, ativar "Iniciar com o macOS",
abrir as configurações, ver o log e reiniciar/sair. **Sair** devolve o mouse ao comportamento de fábrica.

### Como fazer os gestos

Segure o **botão pequeno atrás da roda**, **mova o mouse inteiro** na direção desejada e solte. A ação dispara na
soltura. Sem movimento, conta como clique. (Inclinar a roda para os lados é o *tilt*, que é outro controle.)

---

## Configuração (`config.json`)

Arquivo: `~/Library/Application Support/M535Remap/config.json`. A interface o edita, mas ele também pode ser editado
à mão — o helper recarrega ao salvar e, se o JSON for inválido, mantém a configuração anterior e avisa.
Exemplo completo em [`config.example.json`](config.example.json).

```jsonc
{
  "version": 1,
  "settings": {
    "enabled": true,              // remapeamento ativo
    "gestureThreshold": 50,       // movimento mínimo para o clique virar gesto
    "tiltRepeatIntervalMs": 0,    // 0 = sem repetição do tilt
    "tiltRepeatDelayMs": 400
  },
  "profiles": [
    {
      "id": "default", "name": "Padrão", "apps": [],
      "bindings": {
        "gestureUp": { "type": "system", "action": "missionControl" }
      }
    },
    {
      "id": "com.apple.finder", "name": "Finder", "apps": ["com.apple.finder"],
      "bindings": {
        "gestureUp": { "type": "openApp", "bundleId": "com.apple.Terminal", "name": "Terminal", "toggle": true }
      }
    }
  ]
}
```

**Controles** (chaves de `bindings`): `gestureClick`, `gestureUp`, `gestureDown`, `gestureLeft`, `gestureRight`,
`tiltLeft`, `tiltRight`, `middleClick`.

**Ações:**

| `type` | Campos | Exemplo |
|---|---|---|
| `system` | `action` | `{"type":"system","action":"spaceLeft"}` |
| `keystroke` | `keyCode` (virtual keycode do macOS), `modifiers` (`cmd`, `shift`, `option`, `ctrl`, `fn`), `keyLabel` | `{"type":"keystroke","keyCode":8,"modifiers":["cmd"],"keyLabel":"C"}` |
| `openApp` | `bundleId` e/ou `path`, `name`, `toggle` | `{"type":"openApp","bundleId":"com.apple.Safari"}` |
| `openURL` | `url` (link, ou caminho de arquivo/pasta com `/` ou `~`) | `{"type":"openURL","url":"~/Downloads"}` |
| `shell` | `command` (executado com `/bin/zsh -lc`) | `{"type":"shell","command":"say olá"}` |
| `default` | — | Comportamento nativo (só `middleClick`) |
| `none` | — | Não faz nada |

Ações de sistema disponíveis: `missionControl`, `appExpose`, `showDesktop`, `launchpad`, `spaceLeft`, `spaceRight`,
`fullscreen`, `closeWindow`, `back`, `forward`, `previousTab`, `nextTab`, `zoomIn`, `zoomOut`, `middleClick`,
`playPause`, `nextTrack`, `previousTrack`, `volumeUp`, `volumeDown`, `mute`, `spotlight`, `screenshot`, `lockScreen`.

---

## Desinstalação

Apagar os apps **não** remove configuração, logs, preferências e permissões. Use uma das opções abaixo.

### Pelo app

**Ajustes → Instalação → Desinstalar…** Confirme na janela do macOS (remover o certificado de assinatura é uma
opção separada, desmarcada por padrão). O app se fecha e a remoção termina sozinha; o resultado fica em
`/tmp/m535remap-uninstall.log`.

### Pelo terminal

```bash
scripts/uninstall.sh                # pede confirmação
scripts/uninstall.sh --dry-run      # só mostra o que seria feito
scripts/uninstall.sh --yes          # sem confirmação
scripts/uninstall.sh --remove-cert  # remove também o certificado de assinatura
scripts/uninstall.sh --keep-ui      # mantém o app de configuração
```

O script:

1. desativa "Iniciar com o macOS";
2. **encerra o helper**, devolvendo o mouse ao padrão de fábrica;
3. reseta as permissões de Monitoramento de Entrada e Acessibilidade;
4. remove `M535 Remap Helper.app` e `M535 Remap.app` de `~/Applications` (só apps com o bundle id do projeto);
5. remove configuração, logs e preferências:
   - `~/Library/Application Support/M535Remap`
   - `~/Library/Application Support/M535 Remap`
   - `~/Library/Logs/M535Remap`
   - `~/Library/Preferences/com.m535remap.settings.plist`

O **código do projeto nunca é tocado**. Se o reset de alguma permissão falhar (o script avisa com ⚠︎), remova-a
manualmente em Privacidade e Segurança com o botão **−**.

> Se o helper for apagado enquanto está rodando, ou travar, o botão de gestos e o tilt ficam desviados até o mouse
> ser desligado e ligado de novo. O desinstalador sempre encerra o helper antes.

---

## Desenvolvimento

```bash
# Interface com recarga ao vivo (Vite + Electron)
cd app && npm run dev

# Checagem de tipos
cd app && npm run typecheck

# Build da interface (sem empacotar)
cd app && npm run build

# Helper: compila e monta build/M535 Remap Helper.app (assinado)
scripts/build-helper.sh

# Helper: compila, instala em ~/Applications e reinicia
scripts/build-helper.sh --install

# App completo: helper + interface empacotados e instalados em ~/Applications
cd app && npm run package
```

Rodar o helper direto pelo terminal (logs no stdout; usa as permissões do app de terminal):

```bash
cd helper && swift build -c release && "$(swift build -c release --show-bin-path)/M535Helper" --verbose
```

Captura da interface sem interação (útil para revisar o visual):

```bash
M535_SCREENSHOT=/tmp/ui.png M535_THEME=dark M535_HASH=settings \
  "build/M535 Remap-darwin-arm64/M535 Remap.app/Contents/MacOS/M535 Remap" --user-data-dir=/tmp/m535-ui
```

`M535_THEME` aceita `light`/`dark`; `M535_HASH=settings` abre os Ajustes.

### Protocolo IPC do helper

Socket Unix em `~/Library/Application Support/M535Remap/helper.sock`, JSON por linha:

```bash
printf '{"id":1,"method":"status"}\n' | nc -U -w 1 ~/Library/Application\ Support/M535Remap/helper.sock
```

Métodos: `ping`, `status`, `reloadConfig`, `setEnabled {enabled}`, `runAction {action}`,
`requestPermission {kind}`, `setLaunchAtLogin {enabled}`.
Eventos enviados pelo helper: `status`, `configError`, `control {control, phase}`
(fases `down`, `up`, `fire`, `scrollUp`, `scrollDown`).

---

## Estrutura do projeto

```
m535/
├── helper/                       # Helper nativo (Swift Package)
│   ├── Sources/M535Helper/
│   │   ├── Device/M535Device.swift    # IOHID + HID++ 2.0 (desvio, raw XY, bateria)
│   │   ├── Capture/RemapEngine.swift  # gestos, tilt, clique na roda → ações
│   │   ├── Actions/ActionRunner.swift # atalhos, ações do sistema, apps, URLs, shell
│   │   ├── Config/                    # modelo e leitura/escrita do config.json
│   │   ├── IPC/IPCServer.swift        # socket Unix JSON-lines
│   │   └── App/                       # barra de menus, permissões, login item, log
│   └── Support/                  # Info.plist e ícone do helper
├── app/                          # Interface (Electron + React + TypeScript + Tailwind)
│   ├── electron/                 # processo main, preload, cliente do helper
│   ├── src/
│   │   ├── components/           # diagrama, pad de gestos, editor, prévias, painéis
│   │   ├── shared/               # esquema do config (zod) e keycodes
│   │   └── data/actions.ts       # catálogo de ações do sistema
│   ├── scripts/                  # dev, build do Electron, empacotamento
│   └── build-resources/          # ícone (svg, png, icns)
├── diagnostics/m535diag.swift    # ferramenta de diagnóstico do mouse
├── scripts/
│   ├── create-signing-cert.sh    # certificado autoassinado
│   ├── build-helper.sh           # build/instalação do helper
│   └── uninstall.sh              # desinstalação
└── config.example.json
```

---

## Como funciona

O M535 expõe, além do mouse HID padrão, o protocolo **HID++ 2.0** da Logitech (reports `0x10`/`0x11`).
Pela feature **ReprogControlsV4 (`0x1B04`)** o helper "desvia" controles: o mouse para de enviar o comportamento
nativo e passa a notificar o helper.

| CID | Controle | Desvio |
|---|---|---|
| `0x00D0` | Botão de gestos | com **raw XY** (o cursor fica parado durante o gesto) |
| `0x00CE` | Tilt ← | simples |
| `0x00CF` | Tilt → | simples |
| `0x0052` | Clique na roda | simples, só se algum perfil o remapear |

Esquerdo, direito e rolagem não são desviados; o helper só lê o report nativo `0x02` para o destaque ao vivo.

Particularidades do firmware levantadas no diagnóstico (já tratadas no código):

- **Sempre usar o report longo (`0x11`)**: no curto, o firmware lê lixo nos parâmetros que faltam e responde erro
  `0x02` de forma aleatória.
- Para restaurar um controle, usar as flags **`0x22`**; `0x02` deixa o raw XY ligado.
- `getCidReporting` devolve dados inconsistentes, então o helper não confia em leitura de estado: guarda o estado
  desejado e o reaplica a cada conexão — e também quando detecta que o mouse perdeu o desvio (por exemplo, ao
  acordar), ao ver o atalho nativo ⌃↑ do botão de gestos chegar.
- O desvio não é persistente: desligar o mouse sempre o devolve ao padrão.

---

## Diagnóstico do mouse

`diagnostics/m535diag.swift` foi usado para levantar os controles e o protocolo; útil se algo mudar
(outro firmware, outro modelo):

```bash
cd diagnostics
swiftc -O m535diag.swift -o m535diag
./m535diag perms          # estado das permissões
./m535diag hidpp          # versão HID++, features e controles reprogramáveis
./m535diag monitor        # reports HID brutos lado a lado com os eventos do macOS
./m535diag divert --moves # desvia gestos/tilt e mostra CIDs e direções (Ctrl+C restaura)
./m535diag reset          # restaura os controles ao padrão
```

Encerre o helper antes de usar o `divert`, para os dois não disputarem o mouse. Os `.txt` gerados ficam fora do git
(o `monitor` registra o que é digitado no teclado).

---

## Solução de problemas

| Sintoma | O que fazer |
|---|---|
| Ícone ⚠︎ na barra de menus | Falta permissão: use o menu do helper para concedê-la e depois **Reiniciar para aplicar permissões**. |
| "Helper offline" na interface | Clique em **Iniciar helper** (ou **Instalar helper** se não estiver instalado). |
| Gesto ← / → não troca de desktop | Ative ⌃← / ⌃→ em Ajustes → Teclado → Atalhos → Mission Control, e tenha mais de um desktop. |
| Atalhos não fazem nada | Falta a permissão de **Acessibilidade** para o M535 Remap Helper. |
| Permissões somem após rebuild | O build foi assinado ad-hoc: rode `scripts/create-signing-cert.sh` e recompile. |
| Botões "presos" após o helper travar | Desligue e ligue o mouse (o desvio não é persistente). |
| Ícone antigo no Dock/Finder | Cache do macOS; atualiza sozinho ou ao reabrir o app. |
| Ver o que o helper está fazendo | Menu → **Mostrar log**, ou `~/Library/Logs/M535Remap/helper.log`. |

---

## Limitações

- Botões **esquerdo, direito e rolagem** permanecem nativos (aparecem como "Nativo" no diagrama).
- O gravador de atalhos não captura combinações reservadas pelo sistema (ex.: ⌘Espaço).
- "Mission Control", "Janelas do app", "Mostrar mesa" e "Launchpad" usam uma API privada do Dock, com alternativas
  caso ela não exista; o Launchpad pode não abrir em versões do macOS que o substituíram.
- O app de configuração ocupa ~250 MB por causa do Electron; o remapeamento em si fica no helper, que é leve.
- Testado apenas com o M535 (`046D:B016`, firmware 18.0.3) via Bluetooth.
