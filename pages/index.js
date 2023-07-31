import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import styles from '../styles/Home.module.css';

export default function Home() {
  return (
    <div className={styles.container}>
      <Head>
        <title>Mike Heaton</title>
        <link rel="icon" href="/happy.ico" />
      </Head>

      <main>
        <h1 className={styles.title}>
          Hi, I'm Mike.
        </h1>

        <div className="ppContainer">
        <Image
          src="/face.png"
          width={500}
          height={500}
          alt="Picture of the author"
        />
        </div>

        <div className="contactsContainer">
          <a href="https://www.linkedin.com/in/mikeheatonsf/" className="contact"><Image
            src="/linkedin-circle-large.png"
            width={50}
            height={50}
            alt="Linkedin: @mikeheatonsf"
          /></a>

          <a href="mailto:mike@mikeheaton.uk=" className="contact"><Image
            src="/email-circle-large.png"
            width={50}
            height={50}
            alt="Email: mike@mikeheaton.uk"
          /></a>

          <a href="https://twitter.com/realmikeheaton/" className="contact"><Image
            src="/twitter-circle-large.png"
            width={50}
            height={50}
            alt="Twitter: @realmikeheaton"
          /></a>
        </div>
      </main>

      <style jsx>{`
        main {
          padding: 5%;
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }
        footer {
          width: 100%;
          height: 100px;
          border-top: 1px solid #eaeaea;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        footer img {
          margin-left: 0.5rem;
        }
        footer a {
          display: flex;
          justify-content: center;
          align-items: center;
          text-decoration: none;
          color: inherit;
        }
        code {
          background: #fafafa;
          border-radius: 5px;
          padding: 0.75rem;
          font-size: 1.1rem;
          font-family: Menlo, Monaco, Lucida Console, Liberation Mono,
            DejaVu Sans Mono, Bitstream Vera Sans Mono, Courier New, monospace;
        }
        .contactsContainer {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          width:80%;
          padding: 5%;
        }
        .contact {
          width: 20%;
        }
        .ppContainer {
          justify-content: center;
          padding: 5%;
        }
      `}</style>

      <style jsx global>{`
        html,
        body {
          padding: 0;
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto,
            Oxygen, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue,
            sans-serif;
        }
        * {
          box-sizing: border-box;
        }
      `}</style>
    </div>
  )
}
