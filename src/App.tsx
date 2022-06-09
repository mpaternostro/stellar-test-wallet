import { useEffect, useState } from 'react'
import fetch from 'cross-fetch'
import "./App.css";
import Modal from './lib/Modal';
const stellarSdk: typeof import('stellar-sdk') = window.StellarSdk;

interface Post {
  userId: number
  id: number
  title: string
  body: string
}

const server = new stellarSdk.Server('https://horizon-testnet.stellar.org');

function App() {
  const [publicKey, setPublicKey] = useState("")
  const [balance, setBalance] = useState("0");
  const [connectWalletModalOpen, setConnectWalletModalOpen] = useState(false)
  const [isWalletConnected, setIsWalletConnected] = useState(false);
  const [randomDestinationPublicKey, setRandomDestinationPublicKey] = useState("");

  function createRandomKeypair() {
    const pair = stellarSdk.Keypair.random();
    const publicKey = pair.publicKey();
    const secretKey = pair.secret();
    console.log("new wallet public key", publicKey);
    console.log("new wallet secret key", secretKey);
    setRandomDestinationPublicKey(publicKey);
  }

  function handleShowModal() {
    setConnectWalletModalOpen(true);
  }

  function handleClose() {
    setConnectWalletModalOpen(false)
  }

  async function handleConnectionAccepted() {
    console.log("Connection accepted!");
    setConnectWalletModalOpen(false);
    setIsWalletConnected(true);
    const key = await xBullSDK.getPublicKey();
    setPublicKey(key);
  }

  function handleConnectionRefused() {
    console.log("Connection refused!");
    setConnectWalletModalOpen(false);
  }

  async function loadBalance(publicKey: string) {
    const account = await server.loadAccount(publicKey);
    console.log(account.balances);
    const balance = account.balances[0].balance;
    setBalance(balance);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const publicKey = formData.get("public-key") as string;
    await fetch(`https://friendbot.stellar.org?addr=${publicKey}`);
  }

  async function handleDonate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const destinationPublicKey = formData.get("destination-public-key") as string;
    const sourceAccount = await server.loadAccount(publicKey);

    // Una transacción puede tener hasta 100 operaciones dentro. Cada operación paga un fee.
    const tx = new stellarSdk.TransactionBuilder(sourceAccount, {
        // con esto obtenemos los fees de la red. Si la red está congestionada y no enviamos suficientes fees, entonces nuestra transacción puede fallar.
        // más en https://horizon-testnet.stellar.org/fee_stats
        fee: (await server.fetchBaseFee()).toString(),
        networkPassphrase: stellarSdk.Networks.TESTNET,
    })
      .addMemo(stellarSdk.Memo.text("Test Transaction"))
      .addOperation(stellarSdk.Operation.payment({
        amount: "10",
        asset: stellarSdk.Asset.native(),
        destination: destinationPublicKey,
    }))
      .setTimeout(60 * 10) //10 minutos, luego la tx falla
      .build();

    try {
      const xdr = tx.toXDR()
      const permissions = await xBullSDK.connect({
        canRequestPublicKey: true,
        canRequestSign: true
      });
      console.log("permissions ok", permissions);
      const signedXDR = await xBullSDK.signXDR(xdr, {
        publicKey,
        network: stellarSdk.Networks.TESTNET,
      });
      console.log("signedtransaction", signedXDR);
      const signedTx = new stellarSdk.Transaction(signedXDR, stellarSdk.Networks.TESTNET);
      const txResult = await server.submitTransaction(signedTx);
      console.log("todo bien", txResult);
      loadBalance(publicKey)
    } catch (error) {
      console.error("error noooo", error); 
    }
  }

  async function handleChangeTrust(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const destinationPublicKey = formData.get("destination-public-key") as string;
    const destinationSecretkey = formData.get("destination-secret-key") as string;
    const destinationAsset = formData.get("destination-asset") as string;
    const destinationAssetIssuerPublicAddress = formData.get("destination-asset-issuer-public-address") as string;
    const sourceAccount = await server.loadAccount(destinationPublicKey);

    // Una transacción puede tener hasta 100 operaciones dentro. Cada operación paga un fee.
    const tx = new stellarSdk.TransactionBuilder(sourceAccount, {
        // con esto obtenemos los fees de la red. Si la red está congestionada y no enviamos suficientes fees, entonces nuestra transacción puede fallar.
        // más en https://horizon-testnet.stellar.org/fee_stats
        fee: (await server.fetchBaseFee()).toString(),
        networkPassphrase: stellarSdk.Networks.TESTNET,
    })
      .addOperation(stellarSdk.Operation.changeTrust({
        asset: new stellarSdk.Asset(destinationAsset, destinationAssetIssuerPublicAddress),
      }))
      .setTimeout(60 * 10) //10 minutos, luego la tx falla
      .build();

    try {
      tx.sign(stellarSdk.Keypair.fromSecret(destinationSecretkey));
      const txResult = await server.submitTransaction(tx);
      console.log("cambiaste el trust", txResult);
    } catch (error) {
      console.error("no cambiaste el trust", error); 
    }
  }

  function connectWallet(event) {
    if (event.data.type === 'XBULL_INJECTED' && !!window.xBullSDK) {
      // xBullSDK should be available in the window (global) object
      xBullSDK.getPublicKey()
        .then((key: string) => {
          loadBalance(key);
          setPublicKey(key);
          setIsWalletConnected(true);
        })
        .catch(() => {
          console.error("Could not connect wallet automatically.");
        });
    }
  }

  useEffect(() => {
    window.addEventListener('message', connectWallet, false)

    return () => {
      window.removeEventListener('message', connectWallet, false)
    }
  }, [])

  return (
    <main className="App m-4">
      <nav className='flex justify-between'>
        <h1 className='mb-6'>Stellar Testnet</h1>
        {isWalletConnected
          ? <div><span>Your public key: {publicKey}</span><p>Your XML balance: <span>{balance}</span></p></div>
          : <button type="button" onClick={handleShowModal}>Connect Wallet</button>
        }
      </nav>
      <form onSubmit={handleSubmit} className='my-6 p-3 rounded-lg bg-gray-100 max-w-xl'>
        <label htmlFor="public-key" className="block text-sm font-medium text-gray-700">
          Enter public key to give tokens
        </label>
        <div className="mt-1">
          <input
            type="text"
            name="public-key"
            id="public-key"
            required
            className="p-2 max-w-xl shadow focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            placeholder="G...."
          />
        </div>
        <button
          type="submit"
          className="mt-3 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Don't have any coins to interact? Click here!
        </button>
      </form>

      <div className='my-6 p-3 rounded-lg bg-gray-100 max-w-xl'>
        <button
          type="button"
          onClick={createRandomKeypair}
          className="mt-3 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Get Random Destination Public Key
        </button>
        <p className='mt-2'>Random Destination:</p>
        <p>{randomDestinationPublicKey || "Nothing to display"}</p>
      </div>

      <form onSubmit={handleDonate} className='my-6 p-3 rounded-lg bg-gray-100 max-w-xl'>
        <label htmlFor="destination-public-key" className="block text-sm font-medium text-gray-700">
          Destination Public Key
        </label>
        <div className="mt-1">
          <input
            type="text"
            name="destination-public-key"
            id="destination-public-key"
            className="p-2 max-w-xl shadow focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            placeholder="G...."
          />
        </div>
        <button
          type="submit"
          className="mt-3 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Donate
        </button>
      </form>

      <form onSubmit={handleChangeTrust} className='my-6 p-3 rounded-lg bg-gray-100 max-w-xl'>
        <h2 className='font-medium text-gray-800'>Change destination trustline to asset</h2>
        <label htmlFor="destination-public-key" className="mt-3 block text-sm font-medium text-gray-700">
          Destination Public Key
        </label>
        <div className="mt-1">
          <input
            type="text"
            name="destination-public-key"
            id="destination-public-key"
            className="p-2 max-w-xl shadow focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            placeholder="G...."
          />
        </div>
        <label htmlFor="destination-secret-key" className="mt-3 block text-sm font-medium text-gray-700">
          Destination Secret Key
        </label>
        <div className="mt-1">
          <input
            type="text"
            name="destination-secret-key"
            id="destination-secret-key"
            className="p-2 max-w-xl shadow focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            placeholder="G...."
          />
        </div>
        <label htmlFor="destination-asset" className="mt-3 block text-sm font-medium text-gray-700">
          Destination Asset to change trust
        </label>
        <div className="mt-1">
          <input
            type="text"
            name="destination-asset"
            id="destination-asset"
            className="p-2 max-w-xl shadow focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            placeholder="USDC"
          />
        </div>
        <label htmlFor="destination-asset-issuer-public-address" className="mt-3 block text-sm font-medium text-gray-700">
          Destination Asset Issuer Public Address to change trust
        </label>
        <div className="mt-1">
          <input
            type="text"
            name="destination-asset-issuer-public-address"
            id="destination-asset-issuer-public-address"
            className="p-2 max-w-xl shadow focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            placeholder="GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
          />
        </div>
        <button
          type="submit"
          className="mt-3 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Change Trust
        </button>
      </form>

      <Modal open={connectWalletModalOpen} onClose={handleClose} onSuccess={handleConnectionAccepted} onError={handleConnectionRefused} />
    </main>
  )
}

export default App
