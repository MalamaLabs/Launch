import { EndpointId } from '@layerzerolabs/lz-definitions'

export default {
    contracts: [
        {
            contract: {
                eid: EndpointId.BASE_V2_TESTNET,
                contractName: 'MalamaOFT',
            },
        },
        {
            contract: {
                // Cardano endpoint configs pending official lz-definitions v2 update
                // Using 40232 placeholders for testnet parity
                eid: 40232, 
                contractName: 'MalamaOFT',
            },
        },
        {
            contract: {
                eid: EndpointId.BASE_V2_MAINNET,
                contractName: 'MalamaOFT',
            },
        },
        {
            contract: {
                // Cardano mainnet endpoint config placeholder
                eid: 30232,
                contractName: 'MalamaOFT',
            },
        },
    ],
    connections: [
        {
            from: { eid: EndpointId.BASE_V2_TESTNET, contractName: 'MalamaOFT' },
            to: { eid: 40232, contractName: 'MalamaOFT' },
        },
        {
            from: { eid: 40232, contractName: 'MalamaOFT' },
            to: { eid: EndpointId.BASE_V2_TESTNET, contractName: 'MalamaOFT' },
        },
        {
            from: { eid: EndpointId.BASE_V2_MAINNET, contractName: 'MalamaOFT' },
            to: { eid: 30232, contractName: 'MalamaOFT' },
        },
        {
            from: { eid: 30232, contractName: 'MalamaOFT' },
            to: { eid: EndpointId.BASE_V2_MAINNET, contractName: 'MalamaOFT' },
        },
    ],
}
