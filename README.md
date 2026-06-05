# Video_para_frames

Esse código cria uma aplicação web que permite transformar um vídeo em várias imagens, extraindo todos os frames diretamente no navegador.

O usuário seleciona um vídeo do computador e o sistema usa o FFmpeg.wasm para processar o arquivo localmente. Durante o processamento, cada frame do vídeo é convertido em uma imagem JPG.

Depois da extração, todas as imagens são organizadas automaticamente em um arquivo `.zip`, permitindo que o usuário baixe tudo de uma vez.

A aplicação também mostra:

- o nome e tamanho do vídeo enviado
- o progresso da extração em tempo real
- a quantidade de frames gerados
- uma prévia de alguns frames extraídos

Todo o processamento acontece no próprio navegador, sem enviar arquivos para servidores externos.

O código utiliza:

- HTML para a estrutura da página
- CSS para o design da interface
- JavaScript para toda a lógica da aplicação
- FFmpeg.wasm para processar o vídeo
- JSZip para criar o arquivo `.zip`

Na prática, o projeto funciona como um extrator de frames online que roda totalmente no lado do cliente.
