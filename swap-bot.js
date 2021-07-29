const web3 = require('web3')
const dotenv = require('dotenv')
dotenv.config()
const abi = require('./ABI/abi')
const fetch = require('node-fetch')
const web3js = new web3(process.env.RPC_URL)
var cmd = process.argv[2]

switch (cmd) {
    case 'approve':
        console.log('Approving token')
        approveToken()
        return
    case 'autoswap':
        console.log('Watching balance & auto swap')
        listenSwap()
        break
    default :
        console.log('Invalid cmd')
}

function listenSwap() {
    const inteval = setInterval(() => {
        let contract = new web3js.eth.Contract(abi.minABI, process.env.INPUT_TOKEN)
        contract.methods.balanceOf(process.env.WALLET_ADDRESS).call().then( async balance => {
            if (parseFloat(web3js.utils.fromWei(balance)) > 0.1) {
                const symbol = await contract.methods.symbol().call();
                console.log("You have received " + balance + ' ' + symbol + '. Swapping to BNB')
                clearInterval(inteval)
                sellNow(balance)
                setTimeout(() => listenSwap(), 30000)
            }
        })
    }, 5000)
}

function sellNow(balance) {
    fetch(process.env.PRICE_URL + process.env.INPUT_TOKEN)
        .then(res => res.json())
        .then(data => {
            swapToBNB(process.env.INPUT_TOKEN, balance, data.data.price_BNB, process.env.SLIPPAGE)
        });
}

async function swapToBNB(tokenAddress, amount, price, Slippage) {
    let amountOutMin = (parseFloat(web3js.utils.fromWei(amount)) * price * (1 - (Slippage/100))).toFixed(8)
    amountOutMin = web3js.utils.toWei(amountOutMin, 'ether')
    await swapExecute(tokenAddress, amount, amountOutMin)
}

async function swapExecute(fromToken, amount, amountOutMin) {

    const pancakeContract = new web3js.eth.Contract(abi.pancakeABI, process.env.ROUTER_CONTRACT)
    const swapTX = pancakeContract.methods.swapExactTokensForETH(
        amount,
        amountOutMin,
        [fromToken, process.env.OUTPUT_TOKEN],
        process.env.WALLET_ADDRESS,
        web3.utils.toHex(Math.round(Date.now()/1000)+60*20),
    );

    const count = await web3js.eth.getTransactionCount(process.env.WALLET_ADDRESS);
    const txData = {
        from: process.env.WALLET_ADDRESS,
        to: process.env.ROUTER_CONTRACT,
        nonce : web3js.utils.toHex(count),
        gasPrice :web3js.utils.toHex(5000000000),
        gasLimit :web3js.utils.toHex(300000),
        data: swapTX.encodeABI()
    }
    const signedTx = await web3js.eth.accounts.signTransaction(txData, process.env.PRIVATE_KEY)

    const sentTx = web3js.eth.sendSignedTransaction(signedTx.raw || signedTx.rawTransaction);
    sentTx.on("receipt", receipt => {
        console.log(receipt)
    })
    sentTx.on("error", err => {
        console.log(err)
    });
}

async function approveToken () {
    const tokenContract = new web3js.eth.Contract(abi.minABI, process.env.INPUT_TOKEN)
    var count = await web3js.eth.getTransactionCount(process.env.WALLET_ADDRESS);
    const approveTX = tokenContract.methods.approve(process.env.ROUTER_CONTRACT, "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
    const txData = {
        from: process.env.WALLET_ADDRESS,
        to: process.env.INPUT_TOKEN,
        nonce : web3js.utils.toHex(count),
        gasPrice :web3js.utils.toHex(5000000000),
        gasLimit :web3js.utils.toHex(200000),
        data: approveTX.encodeABI()
    }
    const signedTx =  await web3js.eth.accounts.signTransaction(txData, process.env.PRIVATE_KEY)
    console.log(signedTx)
    const sentTx = web3js.eth.sendSignedTransaction(signedTx.raw || signedTx.rawTransaction);
    sentTx.on("receipt", receipt => {
        console.log(receipt)
    })
    sentTx.on("error", err => {
        console.log(err)
    });
    return
}
