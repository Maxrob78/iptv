import Document, { Html, Head, Main, NextScript } from 'next/document';

class MyDocument extends Document {
  render() {
    return (
      <Html lang="fr">
        <Head>
          <script src="$WEBAPIS/webapis/webapis.js"></script>
          <script src="https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js"></script>
        </Head>
        <body className="bg-[#141414]">
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default MyDocument;
