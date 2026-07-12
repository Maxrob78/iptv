import '../styles/globals.css';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import dynamic from 'next/dynamic';

import AppWrapper from '../components/AppWrapper';

function MyApp(props: AppProps) {
  return (
    <>
      <Head>
        <title>IPTV Platinum Edition</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <AppWrapper {...props} />
    </>
  );
}

export default MyApp;
