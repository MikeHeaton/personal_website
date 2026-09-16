import Head from 'next/head';
import styles from '../styles/Home.module.css';

export default function Home() {
  return (
    <div className={styles.container}>
      <Head>
        <title>Mike Heaton</title>
        <link rel="icon" href="/happy.ico" />
      </Head>

      <main>
        <div className="layoutContainer">
          <div className="titleContainer">
            <h1>
              Hi, I'm Mike.
            </h1>
          </div>

          <div className="profileContainer">
            <img 
                className="profileimage"
                src="/face.png"
                alt="Face"
            ></img>
          </div>  

          <div className="contactsContainer">
            <a href="https://www.linkedin.com/in/mikeheatonsf/" className="contactContainer">
              <img 
                src="/linkedin-circle-large.png"
                alt="Linkedin: @mikeheatonsf"
              ></img>
            </a>

            <a href="mailto:mike@mikeheaton.uk" className="contactContainer">
              <img 
                src="/email-circle-large.png"
                alt="Email: mike@mikeheaton.uk"
              ></img>
            </a>

            <a href="https://twitter.com/realmikeheaton/" className="contactContainer">
              <img 
                src="/twitter-circle-large.png"
                alt="Twitter: @realmikeheaton"
              ></img>
            </a>
          </div>
        </div>
      </main>

      <style jsx>{`
        .layoutContainer {
          width: 100vw;
          max-width: 100vw;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .titleContainer {
          width: 100%;
          display: flex;
          justify-content: center;
          > h1 {
            font-size: 8vw;
            line-height: 10vw;
          }
        }
        .contactsContainer {
          display: flex;
          justify-content: space-around;
          width: 100%;
          padding: 5%; 
        }
        .contactContainer {
          max-width: 15%; 
        }
        .contactContainer img {
          max-width: 100%;
          max-height: 100%;
        }
        .profileContainer {
          width: 100%;
          display: flex;
          justify-content: center;
        }
        .profileContainer img {
          padding: 15%;
          max-width: 100%;
          max-height: 100%;
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
