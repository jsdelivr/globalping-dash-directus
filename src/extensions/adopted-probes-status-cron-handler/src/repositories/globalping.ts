import axios from 'axios';
import { OperationContext } from '@directus/extensions';

export type Probe = {
	ipAddress: string;
	status: string;
};

export const getConnectedProbes = async ({ env }: OperationContext) => {
	const response = await axios.get<Probe[]>(`${env.GLOBALPING_URL}/probes?systemkey=${env.GP_SYSTEM_KEY}`, {
		timeout: 5000,
	});
	return response.data;
};
