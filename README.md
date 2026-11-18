# LH Live Interativa — Rumble Turbo Live

Painel do jogo interativo para lives, servido por Node.js/Express com Socket.IO e integração TikTok Live. O `render.yaml` está configurado para publicar o serviço web na raiz deste repositório.

## Publicar no Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fleonam2510-spec%2Flh-live-interativa2.0)

Abra o botão, entre na sua conta Render (e autorize o acesso ao GitHub se solicitado), confira o serviço e clique em **Apply** para iniciar a publicação. O Render mostrará o endereço público `*.onrender.com` quando o deploy terminar; não é possível saber esse endereço antes de o serviço ser criado na sua conta.

O Blueprint usa `npm install`, `npm start`, a porta `PORT` fornecida pelo Render e o endpoint `/health`. Não é necessário cadastrar uma chave de API para iniciar o projeto.

## Observação sobre o plano gratuito

O Blueprint seleciona `Free` para não iniciar um plano pago sem sua aprovação. O Render informa que o plano gratuito é voltado a testes e projetos pessoais, não recomenda seu uso para produção e pode suspender o serviço após 15 minutos sem tráfego HTTP ou mensagens WebSocket; ao receber uma nova conexão, o serviço pode levar cerca de um minuto para voltar. Para disponibilidade contínua, escolha um plano pago na etapa de criação, após revisar o preço exibido pelo Render.
