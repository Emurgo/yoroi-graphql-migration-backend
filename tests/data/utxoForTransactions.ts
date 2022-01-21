export const utxoForTransactionsRequest = [
  {
    txHash: "00001781e639bdf53cdac97ebbaf43035b35ce59be9f6e480e7b46dcd5c67028",
    index: 2,
  },
  {
    txHash: "00001781e639bdf53cdac97ebbaf43035b35ce59be9f6e480e7b46dcd5c67028",
    index: 4,
  },
];

export const utxoForTransactionResponse = [
  {
    utxo_id:
      "00001781e639bdf53cdac97ebbaf43035b35ce59be9f6e480e7b46dcd5c67028:2",
    tx_hash: "00001781e639bdf53cdac97ebbaf43035b35ce59be9f6e480e7b46dcd5c67028",
    tx_index: 2,
    receiver:
      "addr1qyyv89yc7wxxezym9fxww9jzz2588dm23dhh56w7lnn0ep5la84xq2nfsem7xfzkwlmhhezwd3s04cssx7neszgfkt2sn3yajq",
    amount: "227600000",
    assets: [],
    block_num: 6750594,
  },
  {
    utxo_id:
      "00001781e639bdf53cdac97ebbaf43035b35ce59be9f6e480e7b46dcd5c67028:4",
    tx_hash: "00001781e639bdf53cdac97ebbaf43035b35ce59be9f6e480e7b46dcd5c67028",
    tx_index: 4,
    receiver: "Ae2tdPwUPEZBntoS6p4AhW6UmaoaT4Q2mHsUiyq3JBx5ptSYXiHMD5DNSWc",
    amount: "125387778",
    assets: [],
    block_num: 6750594,
  },
];
