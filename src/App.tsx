import React, { useEffect, useState } from 'react'
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
  const [sourceAsset, setSourceAsset] = useState("XLM");
  const [sourceAssetIssuer, setSourceAssetIssuer] = useState("");
  const [pathPayment, setPathPayment] = useState<InstanceType<typeof stellarSdk.Asset>[] | null>(null);
  const [transactionAmount, setTransactionAmount] = useState("0");

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

  function handleSetSourceAsset(event: React.ChangeEvent<HTMLInputElement>) {
    setSourceAsset(event.target.value);
  }

  function handleSetSourceAssetIssuer(event: React.ChangeEvent<HTMLInputElement>) {
    setSourceAssetIssuer(event.target.value);
  }

  async function handleCheckCurrentConversion(event: React.MouseEvent<HTMLButtonElement>) {
    const asset = sourceAsset === "XLM" ? stellarSdk.Asset.native() : new stellarSdk.Asset(sourceAsset, sourceAssetIssuer);
    const { records } = await server.strictReceivePaths(
      [asset],
      // HARDCODED TO USDC-GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
      new stellarSdk.Asset("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"),
       "10").call();
    setPathPayment(records[0]?.path.map((asset) => {
      if (asset.asset_type === "native") {
        return stellarSdk.Asset.native();
      } 
      return new stellarSdk.Asset(asset.asset_code, asset.asset_issuer);
    }));
    setTransactionAmount(records[0]?.source_amount);
  }

  async function handleDonate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const destinationPublicKey = formData.get("destination-public-key") as string;
    const sourceAsset = formData.get("source-asset") as string;
    const sourceAssetIssuer = formData.get("source-asset-issuer-public-address") as string;
    const sourceAccount = await server.loadAccount(publicKey);

    // Una transacción puede tener hasta 100 operaciones dentro. Cada operación paga un fee.
    const tx = new stellarSdk.TransactionBuilder(sourceAccount, {
        // con esto obtenemos los fees de la red. Si la red está congestionada y no enviamos suficientes fees, entonces nuestra transacción puede fallar.
        // más en https://horizon-testnet.stellar.org/fee_stats
        fee: (await server.fetchBaseFee()).toString(),
        networkPassphrase: stellarSdk.Networks.TESTNET,
    })
      .addMemo(stellarSdk.Memo.text("Test Transaction"))
      .addOperation(stellarSdk.Operation.pathPaymentStrictReceive({
          sendAsset: sourceAsset === "XLM" ? stellarSdk.Asset.native() : new stellarSdk.Asset(sourceAsset, sourceAssetIssuer),
          sendMax: "100", // fijarse bien esto
          destination: destinationPublicKey,
          // HARDCODED TO USDC-GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
          destAsset: new stellarSdk.Asset("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"),
          destAmount: "10",
          path: pathPayment ?? []
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
      <form onSubmit={handleSubmit} className='my-6 p-3 rounded-lg bg-gray-100 max-w-4xl'>
        <label htmlFor="public-key" className="block text-sm font-medium text-gray-700">
          Enter public key to give tokens
        </label>
        <div className="mt-1">
          <input
            type="text"
            name="public-key"
            id="public-key"
            required
            className="p-2 max-w-4xl shadow focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
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

      <div className='my-6 p-3 rounded-lg bg-gray-100 max-w-4xl'>
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

      <form onSubmit={handleDonate} className='my-6 p-3 rounded-lg bg-gray-100 max-w-4xl'>
        <label htmlFor="destination-public-key" className="block text-sm font-medium text-gray-700">
          Destination Public Key
        </label>
        <div className="mt-1">
          <input
            type="text"
            name="destination-public-key"
            id="destination-public-key"
            className="p-2 max-w-4xl shadow focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            placeholder="G...."
          />
        </div>
        <p className='mt-3 text-sm text-gray-500'>
          Destination receives:
          <span className='ml-1 font-medium'>USDC-GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5</span>
        </p>
        <label htmlFor="source-asset" className="mt-3 block text-sm font-medium text-gray-700">
          Source Asset to send (if ommitted, native)
        </label>
        <div className="mt-1">
          <input
            type="text"
            name="source-asset"
            id="source-asset"
            className="p-2 max-w-4xl shadow focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            placeholder="USDC"
            value={sourceAsset}
            onChange={handleSetSourceAsset}
          />
        </div>
        <label htmlFor="source-asset-issuer-public-address" className="mt-3 block text-sm font-medium text-gray-700">
          Source Asset Issuer Public Address
        </label>
        <div className="mt-1">
          <input
            type="text"
            name="source-asset-issuer-public-address"
            id="source-asset-issuer-public-address"
            className="p-2 max-w-4xl shadow focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            placeholder="GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
            value={sourceAssetIssuer}
            onChange={handleSetSourceAssetIssuer}
          />
        </div>
        <p className='mt-3 text-sm text-gray-500'>
          Current conversion:
          <span className='ml-1 font-medium'>{pathPayment ? `1 ${sourceAsset} = ${10/Number(transactionAmount)} USDC` : 'Click "Check current conversion"'}</span>
        </p>
        <p className='mt-3 text-sm text-gray-500'>
          You will be deducted approximately:
          <span className='ml-1 font-medium'>{pathPayment ? `${transactionAmount} ${sourceAsset}` : 'Click "Check current conversion"'}</span>
        </p>
        <button
          type="button"
          onClick={handleCheckCurrentConversion}
          className="mt-3 mr-3 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Check current conversion
        </button>
        <button
          type="submit"
          className="mt-3 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Donate
        </button>
      </form>

      <form onSubmit={handleChangeTrust} className='my-6 p-3 rounded-lg bg-gray-100 max-w-4xl'>
        <h2 className='font-medium text-gray-800'>Change destination trustline to asset</h2>
        <label htmlFor="destination-public-key" className="mt-3 block text-sm font-medium text-gray-700">
          Destination Public Key
        </label>
        <div className="mt-1">
          <input
            type="text"
            name="destination-public-key"
            id="destination-public-key"
            className="p-2 max-w-4xl shadow focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            placeholder="G...."
            required
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
            className="p-2 max-w-4xl shadow focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
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
            className="p-2 max-w-4xl shadow focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
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
            className="p-2 max-w-4xl shadow focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
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
