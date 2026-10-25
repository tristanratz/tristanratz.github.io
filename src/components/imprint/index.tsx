import { useUi } from "../../i18n";
import { useRoute } from "../../router";
import { ImprintText } from "../../store/imprint";
import { Modal } from "../modal";
import "./style.scss";

interface Props {
    open: boolean;
    onClose: () => void;
}

export function Imprint({ open, onClose }: Props) {
    const ui = useUi();
    const { lang } = useRoute().route;
    return (
        <Modal open={open} onClose={onClose} label={ui.contact.imprint}>
            <div className="imprintContent" lang="de"><ImprintText english={lang === "en"} /></div>
        </Modal>
    );
}
